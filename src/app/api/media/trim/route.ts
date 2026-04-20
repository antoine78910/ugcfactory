export const runtime = "nodejs";

import { existsSync, statSync } from "fs";
import { chmod, readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { gunzipSync } from "zlib";
import { randomUUID } from "crypto";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

const FFMPEG_BIN = join(tmpdir(), "ffmpeg");
const FFMPEG_GZ_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz";
const MIN_BINARY_SIZE = 30 * 1024 * 1024;

async function ensureFfmpeg(): Promise<string> {
  if (existsSync(FFMPEG_BIN)) {
    const size = statSync(FFMPEG_BIN).size;
    if (size > MIN_BINARY_SIZE) return FFMPEG_BIN;
  }
  const res = await fetch(FFMPEG_GZ_URL, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`ffmpeg download failed: HTTP ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  const bin = gunzipSync(gz);
  if (bin.length < MIN_BINARY_SIZE) throw new Error("ffmpeg binary too small");
  await writeFile(FFMPEG_BIN, bin);
  await chmod(FFMPEG_BIN, 0o755);
  return FFMPEG_BIN;
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 20 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg failed: ${stderr || err.message}`));
      else resolve();
    });
  });
}

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
    await writeFile(inPath, Buffer.from(await file.arrayBuffer()));

    try {
      const baseArgs = ["-ss", String(startSec), "-to", String(endSec), "-i", inPath];
      if (kind === "video") {
        await runFfmpeg(bin, [
          ...baseArgs,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          "-y",
          outPath,
        ]);
      } else {
        await runFfmpeg(bin, [
          ...baseArgs,
          "-vn",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "192k",
          "-y",
          outPath,
        ]);
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
