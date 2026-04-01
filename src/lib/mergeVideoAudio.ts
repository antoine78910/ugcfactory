"use client";
// Client-side video+audio merge using ffmpeg.wasm (single-threaded, no SharedArrayBuffer / COOP+COEP headers needed).
// The first call downloads ~10 MB of JS + ~25 MB wasm from jsDelivr CDN and caches them as blob URLs.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

let instance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (instance?.loaded) return instance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ff = new FFmpeg();
    const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    instance = ff;
    return ff;
  })();

  return loadPromise;
}

/**
 * Merges a video source (URL or blob URL) with a new audio track (URL or blob URL).
 * The original video audio is replaced; the video stream is copied without re-encoding.
 * Returns a local `blob:` URL pointing to the merged MP4.
 *
 * @param videoSrc  URL or blob URL of the original video.
 * @param audioSrc  URL or blob URL of the new audio (mp3/opus/wav…).
 * @param onProgress  Called with values 0→1 as encoding progresses.
 */
export async function mergeVideoWithAudio(
  videoSrc: string,
  audioSrc: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const ff = await getFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(1, Math.max(0, progress)));
  };
  ff.on("progress", progressHandler);

  try {
    const [videoData, audioData] = await Promise.all([
      fetchFile(videoSrc),
      fetchFile(audioSrc),
    ]);

    await ff.writeFile("in.mp4", videoData);
    await ff.writeFile("in_audio", audioData);

    // Copy video stream, re-encode audio to AAC, trim to shorter stream.
    await ff.exec([
      "-i", "in.mp4",
      "-i", "in_audio",
      "-c:v", "copy",
      "-c:a", "aac",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-shortest",
      "-movflags", "+faststart",
      "out.mp4",
    ]);

    const data = await ff.readFile("out.mp4");
    // `data` is Uint8Array; copy bytes into a plain ArrayBuffer for Blob compatibility.
    const bytes: Uint8Array = data instanceof Uint8Array ? data : new Uint8Array((data as unknown as ArrayBuffer));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], { type: "video/mp4" });
    return URL.createObjectURL(blob);
  } finally {
    ff.off("progress", progressHandler);
    await ff.deleteFile("in.mp4").catch(() => {});
    await ff.deleteFile("in_audio").catch(() => {});
    await ff.deleteFile("out.mp4").catch(() => {});
  }
}
