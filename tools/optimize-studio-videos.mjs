#!/usr/bin/env node
/**
 * Re-encode the landing-page hero carousel videos (public/studio/0328(1..10).mp4) at a smaller
 * file size and generate lightweight JPEG posters used as <video poster=…> placeholders.
 *
 * Run from the project root:
 *   node tools/optimize-studio-videos.mjs
 *
 * Settings rationale (audited 2026-05-11):
 *   - Source clips are 480×854 / 24fps / ~1 Mbps / ~15 s / no meaningful audio. Each weighs ~1.5–2 MB.
 *   - LP carousel panels max out at ~224×400 px on desktop, so 480p is already overkill but we keep
 *     it so users zooming on retina still see crisp detail. The headline wins come from CRF 30 +
 *     dropping the audio track + moving the moov atom to the front so playback starts immediately.
 *   - Output target ~300–500 KB per clip (~75 % smaller). 10 clips ≈ 3.5 MB total instead of 13.5 MB.
 *
 * Posters: a 320 px JPEG of the first frame (≈30–60 KB) used to paint the 3D ring instantly so the
 * back-facing panels never need to download their full video before the user sees content.
 *
 * Requires `ffmpeg` on PATH. Bails if missing.
 */
import { spawn } from "node:child_process";
import { mkdir, stat, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");
const STUDIO_DIR = path.join(PROJECT_ROOT, "public", "studio");
const POSTER_DIR = path.join(STUDIO_DIR, "posters");
const SOURCE_NAMES = Array.from({ length: 10 }, (_, i) => `0328(${i + 1}).mp4`);

/** Re-encode settings. Tuned for the LP hero carousel (480×854 → 480p, CRF 30, no audio). */
const ENCODE_PRESET = "slow";
const ENCODE_CRF = "30";
const ENCODE_SCALE = "scale=-2:480"; // keeps height at 480, width auto-rounded to even
const POSTER_TIME = "00:00:00.5"; // grab frame ~0.5 s in to avoid blank first frame
const POSTER_SCALE = "320:-1";
const POSTER_QUALITY = "6"; // ffmpeg -q:v scale; 2 = best, 31 = worst. 6 ≈ ~75 % JPEG quality.

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}\n${stderr.trim()}`));
    });
  });
}

async function fileSize(p) {
  try {
    const s = await stat(p);
    return s.size;
  } catch {
    return 0;
  }
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function ensureFfmpeg() {
  try {
    await run("ffmpeg", ["-version"]);
  } catch {
    throw new Error("ffmpeg is not on PATH. Install via brew / chocolatey / apt and retry.");
  }
}

async function processOne(name) {
  const src = path.join(STUDIO_DIR, name);
  if (!existsSync(src)) {
    console.warn(`skip ${name}: not found`);
    return null;
  }
  const tmpOpt = path.join(STUDIO_DIR, `.tmp.${name}`);
  const poster = path.join(POSTER_DIR, name.replace(/\.mp4$/i, ".jpg"));

  // Re-encode to tmp file first; only swap once both outputs succeeded.
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    src,
    "-c:v",
    "libx264",
    "-preset",
    ENCODE_PRESET,
    "-crf",
    ENCODE_CRF,
    "-vf",
    ENCODE_SCALE,
    "-an",
    "-movflags",
    "+faststart",
    tmpOpt,
  ]);

  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    POSTER_TIME,
    "-i",
    src,
    "-vframes",
    "1",
    "-vf",
    `scale=${POSTER_SCALE}`,
    "-q:v",
    POSTER_QUALITY,
    poster,
  ]);

  const beforeSize = await fileSize(src);
  const afterSize = await fileSize(tmpOpt);
  const posterSize = await fileSize(poster);

  // Swap optimised file into place once both outputs exist.
  await rename(tmpOpt, src);
  return { name, beforeSize, afterSize, posterSize };
}

async function main() {
  await ensureFfmpeg();
  await mkdir(POSTER_DIR, { recursive: true });

  const results = [];
  for (const name of SOURCE_NAMES) {
    process.stdout.write(`encoding ${name} … `);
    try {
      const r = await processOne(name);
      if (!r) {
        process.stdout.write("skipped\n");
        continue;
      }
      results.push(r);
      const ratio = r.beforeSize ? `${Math.round((r.afterSize / r.beforeSize) * 100)} %` : "—";
      process.stdout.write(
        `${kb(r.beforeSize)} → ${kb(r.afterSize)} (${ratio}); poster ${kb(r.posterSize)}\n`,
      );
    } catch (err) {
      process.stdout.write(`failed: ${err.message}\n`);
      // Clean up tmp files on failure.
      const tmp = path.join(STUDIO_DIR, `.tmp.${name}`);
      if (existsSync(tmp)) await rm(tmp, { force: true });
    }
  }

  const totalBefore = results.reduce((acc, r) => acc + r.beforeSize, 0);
  const totalAfter = results.reduce((acc, r) => acc + r.afterSize, 0);
  const totalPoster = results.reduce((acc, r) => acc + r.posterSize, 0);

  console.log("---");
  console.log(
    `videos: ${kb(totalBefore)} → ${kb(totalAfter)}`,
    totalBefore ? `(${Math.round((totalAfter / totalBefore) * 100)} %)` : "",
  );
  console.log(`posters: ${kb(totalPoster)}`);
  console.log(`net payload change: ${kb(totalAfter + totalPoster - totalBefore)} (poster overhead included)`);
}

void main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
