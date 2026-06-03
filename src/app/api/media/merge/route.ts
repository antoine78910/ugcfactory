export const runtime = "nodejs";
export const maxDuration = 300;

import { readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

import { ensureFfmpeg, runFfmpeg } from "@/lib/ffmpegServer";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export const WORKFLOW_VIDEO_MERGE_MAX = 20;
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`Could not download video (${res.status}).`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_DOWNLOAD_BYTES) throw new Error("Video file too large.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_DOWNLOAD_BYTES) throw new Error("Video file too large.");
  await writeFile(destPath, buf);
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  try {
    const body = (await req.json().catch(() => null)) as { urls?: unknown } | null;
    const rawUrls = Array.isArray(body?.urls) ? body.urls : [];
    const urls = rawUrls
      .filter((u): u is string => typeof u === "string")
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));

    if (urls.length < 2) {
      return Response.json({ error: "At least 2 video URLs are required." }, { status: 400 });
    }
    if (urls.length > WORKFLOW_VIDEO_MERGE_MAX) {
      return Response.json(
        { error: `Maximum ${WORKFLOW_VIDEO_MERGE_MAX} videos per merge.` },
        { status: 400 },
      );
    }

    const bin = await ensureFfmpeg();
    const id = randomUUID();
    const dir = tmpdir();
    const inputPaths: string[] = [];
    const cleanup: string[] = [];

    for (let i = 0; i < urls.length; i++) {
      const p = join(dir, `merge-in-${id}-${i}.mp4`);
      inputPaths.push(p);
      cleanup.push(p);
      await downloadToFile(urls[i], p);
    }

    const listPath = join(dir, `merge-list-${id}.txt`);
    const outPath = join(dir, `merge-out-${id}.mp4`);
    cleanup.push(listPath, outPath);

    const listBody = inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await writeFile(listPath, listBody, "utf8");

    try {
      try {
        await runFfmpeg(bin, [
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          "-y",
          outPath,
        ]);
      } catch {
        const inputs = inputPaths.flatMap((p) => ["-i", p]);
        const n = inputPaths.length;
        const scaleParts = inputPaths.map(
          (_, i) =>
            `[${i}:v:0]scale=1080:-2:force_original_aspect_ratio=decrease,setsar=1,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v${i}]`,
        );
        const concatIn = inputPaths.map((_, i) => `[v${i}]`).join("");
        const filter = `${scaleParts.join(";")};${concatIn}concat=n=${n}:v=1:a=0[outv]`;
        await runFfmpeg(bin, [
          ...inputs,
          "-filter_complex",
          filter,
          "-map",
          "[outv]",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-movflags",
          "+faststart",
          "-y",
          outPath,
        ]);
      }

      const out = await readFile(outPath);
      if (out.length === 0) throw new Error("Merge produced an empty file.");
      return new Response(out, {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "cache-control": "no-store",
        },
      });
    } finally {
      await Promise.all(cleanup.map((p) => unlink(p).catch(() => {})));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Video merge failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
