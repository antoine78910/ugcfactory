"use client";

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
 * Extract the audio track from a video file using ffmpeg.wasm.
 * Returns a File containing the extracted audio as MP3.
 */
export async function extractAudioFromVideo(
  videoSrc: string | File | Blob,
  filenameBase = "extracted-audio",
): Promise<File> {
  const ff = await getFFmpeg();

  try {
    const videoData =
      videoSrc instanceof Blob
        ? new Uint8Array(await videoSrc.arrayBuffer())
        : await fetchFile(videoSrc);
    await ff.writeFile("extract_in.mp4", videoData);

    await ff.exec([
      "-i", "extract_in.mp4",
      "-vn",
      "-acodec", "libmp3lame",
      "-q:a", "2",
      "-y",
      "extract_out.mp3",
    ]);

    const data = await ff.readFile("extract_out.mp3");
    const bytes: Uint8Array =
      data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBuffer);
    if (bytes.byteLength === 0) {
      throw new Error("No audio track found in this video.");
    }
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], { type: "audio/mpeg" });
    return new File([blob], `${filenameBase}.mp3`, { type: "audio/mpeg" });
  } finally {
    await ff.deleteFile("extract_in.mp4").catch(() => {});
    await ff.deleteFile("extract_out.mp3").catch(() => {});
  }
}

/**
 * Merges a video source with a new audio track.
 * The original video audio is replaced; the video stream is copied without re-encoding.
 * Returns a local `blob:` URL pointing to the merged MP4.
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

    await ff.exec([
      "-i", "in.mp4",
      "-i", "in_audio",
      "-c:v", "copy",
      "-c:a", "aac",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-shortest",
      "-movflags", "+faststart",
      "-y",
      "out.mp4",
    ]);

    const data = await ff.readFile("out.mp4");
    const bytes: Uint8Array =
      data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBuffer);
    if (bytes.byteLength === 0) {
      throw new Error("ffmpeg produced an empty output file.");
    }
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
