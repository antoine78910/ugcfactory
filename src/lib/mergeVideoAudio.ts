"use client";

/*
 * ffmpeg.wasm loaded from esm.sh CDN at runtime.
 *
 * The npm packages @ffmpeg/ffmpeg and @ffmpeg/util contain dynamic expressions
 * that break Next.js webpack ("Cannot find module as expression is too dynamic").
 * Loading from esm.sh with webpackIgnore bypasses webpack while keeping native
 * ES module resolution in the browser.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let instance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;

const CORE_CDN = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadFFmpegModule(): Promise<any> {
  // @ts-expect-error — URL import; webpack must not touch this (webpackIgnore)
  return import(/* webpackIgnore: true */ "https://esm.sh/@ffmpeg/ffmpeg@0.12.15");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadUtilModule(): Promise<any> {
  // @ts-expect-error — URL import; webpack must not touch this (webpackIgnore)
  return import(/* webpackIgnore: true */ "https://esm.sh/@ffmpeg/util@0.12.2");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFFmpeg(): Promise<any> {
  if (instance?.loaded) return instance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [ffmpegMod, utilMod] = await Promise.all([
      loadFFmpegModule(),
      loadUtilModule(),
    ]);
    const { FFmpeg } = ffmpegMod;
    const { toBlobURL } = utilMod;

    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${CORE_CDN}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_CDN}/ffmpeg-core.wasm`, "application/wasm"),
    });
    instance = ff;
    return ff;
  })();

  return loadPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function doFetchFile(src: string): Promise<any> {
  const mod = await loadUtilModule();
  return mod.fetchFile(src);
}

/**
 * Extract the audio track from a video file using ffmpeg.wasm.
 * Returns a File containing the extracted audio as M4A (AAC).
 */
export async function extractAudioFromVideo(
  videoSrc: string | File | Blob,
  filenameBase = "extracted-audio",
): Promise<File> {
  const ff = await getFFmpeg();

  const logs: string[] = [];
  const logHandler = ({ message }: { message: string }) => {
    logs.push(message);
  };
  ff.on("log", logHandler);

  try {
    const videoData =
      videoSrc instanceof Blob
        ? new Uint8Array(await videoSrc.arrayBuffer())
        : await doFetchFile(videoSrc);
    await ff.writeFile("extract_in.mp4", videoData);

    const exitCode = await ff.exec([
      "-i", "extract_in.mp4",
      "-vn",
      "-c:a", "aac",
      "-b:a", "128k",
      "-y",
      "extract_out.m4a",
    ]);

    if (exitCode !== 0) {
      const tail = logs.slice(-5).join("\n");
      throw new Error(`Audio extraction failed (exit ${exitCode}). ${tail}`);
    }

    const data = await ff.readFile("extract_out.m4a");
    const bytes: Uint8Array =
      data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBuffer);
    if (bytes.byteLength === 0) {
      throw new Error("No audio track found in this video.");
    }
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([buffer], { type: "audio/mp4" });
    return new File([blob], `${filenameBase}.m4a`, { type: "audio/mp4" });
  } finally {
    ff.off("log", logHandler);
    await ff.deleteFile("extract_in.mp4").catch(() => {});
    await ff.deleteFile("extract_out.m4a").catch(() => {});
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
      doFetchFile(videoSrc),
      doFetchFile(audioSrc),
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
