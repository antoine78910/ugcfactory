/**
 * Server-side video + audio merge.
 *
 * Downloads a static ffmpeg binary to /tmp on first use (works on any serverless
 * platform including Vercel). Subsequent warm invocations reuse the cached binary.
 */

import { existsSync, statSync } from "fs";
import { writeFile, readFile, unlink, chmod } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execFile } from "child_process";

const FFMPEG_BIN = join(tmpdir(), "ffmpeg");

const FFMPEG_DOWNLOAD_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/linux-x64";

const MIN_BINARY_SIZE = 30 * 1024 * 1024; // expect at least 30 MB

async function ensureFfmpeg(): Promise<string> {
  if (existsSync(FFMPEG_BIN)) {
    const size = statSync(FFMPEG_BIN).size;
    if (size > MIN_BINARY_SIZE) {
      return FFMPEG_BIN;
    }
    console.warn(`[merge] Existing ffmpeg binary too small (${size} bytes), re-downloading`);
  }

  console.log("[merge] Downloading ffmpeg binary from", FFMPEG_DOWNLOAD_URL);
  const res = await fetch(FFMPEG_DOWNLOAD_URL, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to download ffmpeg: HTTP ${res.status} ${res.statusText}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  console.log(`[merge] Downloaded ${buf.length} bytes`);

  if (buf.length < MIN_BINARY_SIZE) {
    throw new Error(
      `Downloaded ffmpeg binary is too small (${buf.length} bytes). Expected at least ${MIN_BINARY_SIZE}.`,
    );
  }

  await writeFile(FFMPEG_BIN, buf);
  await chmod(FFMPEG_BIN, 0o755);

  // Verify the binary actually works
  const version = await new Promise<string>((resolve, reject) => {
    execFile(FFMPEG_BIN, ["-version"], { timeout: 10_000 }, (err, stdout) => {
      if (err) reject(new Error(`ffmpeg verification failed: ${err.message}`));
      else resolve(stdout.split("\n")[0] ?? "");
    });
  });
  console.log("[merge] ffmpeg binary ready:", version);

  return FFMPEG_BIN;
}

function runFfmpeg(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`ffmpeg failed: ${err.message}\n${stderr}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export async function mergeVideoWithAudioServer(
  videoBuffer: Buffer,
  audioBuffer: Buffer,
): Promise<Buffer> {
  const bin = await ensureFfmpeg();

  const id = randomUUID();
  const dir = tmpdir();
  const videoPath = join(dir, `merge-v-${id}.mp4`);
  const audioPath = join(dir, `merge-a-${id}.mp3`);
  const outputPath = join(dir, `merge-o-${id}.mp4`);

  await Promise.all([
    writeFile(videoPath, videoBuffer),
    writeFile(audioPath, audioBuffer),
  ]);

  try {
    await runFfmpeg(bin, [
      "-i", videoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-shortest",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ]);

    const out = await readFile(outputPath);
    if (out.length === 0) throw new Error("ffmpeg produced an empty output.");
    return out;
  } finally {
    await Promise.all([
      unlink(videoPath).catch(() => {}),
      unlink(audioPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  }
}
