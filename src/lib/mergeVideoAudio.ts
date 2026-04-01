"use client";

/*
 * ffmpeg.wasm — loaded from /public/ffmpeg/ (same-origin UMD build).
 *
 * The npm @ffmpeg/ffmpeg package breaks Next.js webpack due to dynamic
 * expressions. Hosting the UMD build in public/ ensures:
 * - Same-origin (no CORS / CSP issues)
 * - The Web Worker (814.ffmpeg.js) resolves from the same directory
 * - No webpack bundling involved
 *
 * toBlobURL and fetchFile are reimplemented inline (trivial functions)
 * so we don't need @ffmpeg/util either.
 */

const CORE_CDN = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let instance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;

async function toBlobURL(url: string, mimeType: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: mimeType }));
}

async function fetchFileAsUint8Array(src: string | File | Blob): Promise<Uint8Array> {
  if (src instanceof Blob) {
    return new Uint8Array(await src.arrayBuffer());
  }
  if (typeof src === "string") {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to fetch file: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array();
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.type = "text/javascript";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFFmpeg(): Promise<any> {
  if (instance?.loaded) return instance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await loadScript("/ffmpeg/ffmpeg.js");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const global = window as unknown as Record<string, any>;
    const FFmpegWASM = global.FFmpegWASM;
    if (!FFmpegWASM?.FFmpeg) {
      throw new Error("FFmpegWASM not found after loading script.");
    }

    const ff = new FFmpegWASM.FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${CORE_CDN}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_CDN}/ffmpeg-core.wasm`, "application/wasm"),
    });
    instance = ff;
    return ff;
  })();

  return loadPromise;
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
    const videoData = await fetchFileAsUint8Array(videoSrc);
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
      fetchFileAsUint8Array(videoSrc),
      fetchFileAsUint8Array(audioSrc),
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
