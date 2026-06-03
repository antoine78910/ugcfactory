import { existsSync, statSync } from "fs";
import { chmod, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { gunzipSync } from "zlib";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_BIN = join(tmpdir(), process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const FFMPEG_GZ_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz";
const MIN_BINARY_SIZE = 30 * 1024 * 1024;

function verifyFfmpeg(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, ["-version"], { timeout: 10_000 }, (err) => {
      resolve(!err);
    });
  });
}

export async function ensureFfmpeg(): Promise<string> {
  if (typeof ffmpegStatic === "string" && ffmpegStatic && existsSync(ffmpegStatic)) {
    const ok = await verifyFfmpeg(ffmpegStatic);
    if (ok) return ffmpegStatic;
  }

  if (await verifyFfmpeg("ffmpeg")) return "ffmpeg";

  if (existsSync(FFMPEG_BIN)) {
    const size = statSync(FFMPEG_BIN).size;
    if (size > MIN_BINARY_SIZE) {
      const ok = await verifyFfmpeg(FFMPEG_BIN);
      if (ok) return FFMPEG_BIN;
    }
  }

  if (process.platform !== "linux") {
    throw new Error(
      "ffmpeg not found on this system. Install ffmpeg or keep ffmpeg-static dependency available.",
    );
  }

  const res = await fetch(FFMPEG_GZ_URL, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`ffmpeg download failed: HTTP ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  const bin = gunzipSync(gz);
  if (bin.length < MIN_BINARY_SIZE) throw new Error("ffmpeg binary too small");
  await writeFile(FFMPEG_BIN, bin);
  await chmod(FFMPEG_BIN, 0o755);
  const ok = await verifyFfmpeg(FFMPEG_BIN);
  if (!ok) throw new Error("ffmpeg downloaded but could not execute");
  return FFMPEG_BIN;
}

export function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 20 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg failed: ${stderr || err.message}`));
      else resolve();
    });
  });
}
