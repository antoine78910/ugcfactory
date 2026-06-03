export const runtime = "nodejs";

import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { ensureFfmpeg, runFfmpeg } from "@/lib/ffmpegServer";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "").trim();
    const startSec = Number(form.get("startSec"));
    const endSec = Number(form.get("endSec"));

    if (!(file instanceof File)) {
      return Response.json({ error: "Missing file" }, { status: 400 });
    }
    if (kind !== "video" && kind !== "audio") {
      return Response.json({ error: "Invalid kind" }, { status: 400 });
    }
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
      return Response.json({ error: "Invalid trim range" }, { status: 400 });
    }

    const bin = await ensureFfmpeg();
    const id = randomUUID();
    const inExt = kind === "video" ? ".mp4" : ".mp3";
    const outExt = kind === "video" ? ".mp4" : ".mp3";
    const inPath = join(tmpdir(), `trim-in-${id}${inExt}`);
    const outPath = join(tmpdir(), `trim-out-${id}${outExt}`);
    const durationSec = Math.max(0.01, endSec - startSec);
    const startArg = String(startSec);
    const durationArg = durationSec.toFixed(3);
    await writeFile(inPath, Buffer.from(await file.arrayBuffer()));

    try {
      if (kind === "video") {
        try {
          // Fast path: stream copy (no re-encode) to keep trim in a few seconds.
          await runFfmpeg(bin, [
            "-ss",
            startArg,
            "-t",
            durationArg,
            "-i",
            inPath,
            "-map",
            "0:v:0?",
            "-map",
            "0:a:0?",
            "-c",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            "-y",
            outPath,
          ]);
        } catch {
          // Fallback: re-encode only if copy mode fails on edge codecs/containers.
          await runFfmpeg(bin, [
            "-ss",
            startArg,
            "-t",
            durationArg,
            "-i",
            inPath,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "28",
            "-c:a",
            "aac",
            "-tune",
            "fastdecode",
            "-y",
            outPath,
          ]);
        }
      } else {
        try {
          await runFfmpeg(bin, [
            "-ss",
            startArg,
            "-t",
            durationArg,
            "-i",
            inPath,
            "-vn",
            "-c:a",
            "copy",
            "-y",
            outPath,
          ]);
        } catch {
          await runFfmpeg(bin, [
            "-ss",
            startArg,
            "-t",
            durationArg,
            "-i",
            inPath,
            "-vn",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "160k",
            "-y",
            outPath,
          ]);
        }
      }

      const out = await readFile(outPath);
      return new Response(out, {
        status: 200,
        headers: {
          "content-type": kind === "video" ? "video/mp4" : "audio/mpeg",
          "cache-control": "no-store",
        },
      });
    } finally {
      await Promise.all([unlink(inPath).catch(() => {}), unlink(outPath).catch(() => {})]);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trim failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
