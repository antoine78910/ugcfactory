/**
 * Shared upload rules (Studio, Link to Ad, motion, API /uploads).
 * HEIC/HEIF are rejected with an explicit message (common iPhone issue).
 */

export const STUDIO_IMAGE_FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";

export const STUDIO_VIDEO_FILE_ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";

/** PiAPI Seedance 2 omni: mp3, wav only. */
export const STUDIO_AUDIO_FILE_ACCEPT = "audio/mpeg,audio/wav,.mp3,.wav";

const AUDIO_MIMES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"]);

const AUDIO_EXTS = new Set([".mp3", ".wav"]);

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm"]);

const HEIC_MIMES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const HEIC_EXTS = new Set([".heic", ".heif"]);

export const FORMAT_HINT_IMAGE =
  "Allowed: JPEG, PNG, WebP, or GIF (not HEIC—export as “Most Compatible” on iPhone or convert online).";

export const FORMAT_HINT_VIDEO = "Allowed: MP4, MOV, or WebM.";

/** @deprecated Use {@link FORMAT_HINT_VIDEO} */
export const FORMAT_HINT_VIDEO_FR = FORMAT_HINT_VIDEO;

export const FORMAT_HINT_AUDIO =
  "Allowed: MP3 or WAV (about 15 seconds or less is recommended for Seedance audio references).";

export const HEIC_NOT_SUPPORTED_MESSAGE =
  "HEIC / HEIF is not supported. On iPhone: Settings → Camera → Formats → “Most Compatible”, or export to JPEG/PNG before uploading.";

/** @deprecated Use {@link FORMAT_HINT_IMAGE} */
export const FORMAT_HINT_IMAGE_FR = FORMAT_HINT_IMAGE;
/** @deprecated Use {@link FORMAT_HINT_AUDIO} */
export const FORMAT_HINT_AUDIO_FR = FORMAT_HINT_AUDIO;
/** @deprecated Use {@link HEIC_NOT_SUPPORTED_MESSAGE} */
export const HEIC_NOT_SUPPORTED_FR = HEIC_NOT_SUPPORTED_MESSAGE;

export function normalizeMime(mime: string): string {
  const m = mime.toLowerCase().trim();
  if (m === "image/jpg") return "image/jpeg";
  return m;
}

export function fileExtensionLower(file: File): string {
  const name = file.name || "";
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i).toLowerCase();
}

export function isHeicLike(file: File): boolean {
  const mime = normalizeMime(file.type || "");
  if (HEIC_MIMES.has(mime)) return true;
  return HEIC_EXTS.has(fileExtensionLower(file));
}

export function isAllowedStudioImageFile(file: File): boolean {
  if (isHeicLike(file)) return false;
  const mime = normalizeMime(file.type || "");
  const ext = fileExtensionLower(file);
  return IMAGE_MIMES.has(mime) || IMAGE_EXTS.has(ext);
}

export function isAllowedStudioVideoFile(file: File): boolean {
  const mime = normalizeMime(file.type || "");
  const ext = fileExtensionLower(file);
  return VIDEO_MIMES.has(mime) || VIDEO_EXTS.has(ext);
}

export function isAllowedStudioAudioFile(file: File): boolean {
  const mime = normalizeMime(file.type || "");
  const ext = fileExtensionLower(file);
  return AUDIO_MIMES.has(mime) || AUDIO_EXTS.has(ext);
}

export function assertStudioImageUpload(file: File): void {
  if (isHeicLike(file)) {
    throw new Error(HEIC_NOT_SUPPORTED_MESSAGE);
  }
  if (isAllowedStudioImageFile(file)) return;
  const ext = fileExtensionLower(file);
  const mime = normalizeMime(file.type || "");
  if (mime.startsWith("image/") || ext) {
    throw new Error(
      `Unsupported image format (${ext || mime || "?"}). ${FORMAT_HINT_IMAGE}`,
    );
  }
  throw new Error(`Could not detect a valid image. ${FORMAT_HINT_IMAGE}`);
}

export function assertStudioAudioUpload(file: File): void {
  if (isAllowedStudioAudioFile(file)) return;
  const ext = fileExtensionLower(file);
  const mime = normalizeMime(file.type || "");
  if (mime.startsWith("audio/") || AUDIO_EXTS.has(ext)) {
    throw new Error(`Unsupported audio format (${ext || mime || "?"}). ${FORMAT_HINT_AUDIO}`);
  }
  throw new Error(`Unrecognized audio file. ${FORMAT_HINT_AUDIO}`);
}

export function assertStudioVideoUpload(file: File): void {
  if (isHeicLike(file)) {
    throw new Error("This file looks like a HEIC photo, not a video. " + HEIC_NOT_SUPPORTED_MESSAGE);
  }
  if (isAllowedStudioVideoFile(file)) return;
  const ext = fileExtensionLower(file);
  const mime = normalizeMime(file.type || "");
  if (mime.startsWith("video/") || ext === ".m4v" || ext === ".avi") {
    throw new Error(
      `Unsupported video format (${ext || mime || "?"}). ${FORMAT_HINT_VIDEO}`,
    );
  }
  throw new Error(`Unrecognized video file. ${FORMAT_HINT_VIDEO}`);
}

export function assertStudioUploadForKind(file: File, kind: "image" | "video" | "audio"): void {
  if (kind === "video") assertStudioVideoUpload(file);
  else if (kind === "audio") assertStudioAudioUpload(file);
  else assertStudioImageUpload(file);
}

export function inferStudioUploadKind(file: File): "image" | "video" | "audio" {
  const mime = normalizeMime(file.type || "");
  const ext = fileExtensionLower(file);
  if (mime.startsWith("video/") || VIDEO_EXTS.has(ext)) return "video";
  if (mime.startsWith("audio/") || AUDIO_EXTS.has(ext)) return "audio";
  return "image";
}

/** `/api/uploads`: multipart file must be an allowed image or video. */
export function assertGenericMultipartUpload(file: File): void {
  if (isHeicLike(file)) {
    throw new Error(HEIC_NOT_SUPPORTED_MESSAGE);
  }
  if (isAllowedStudioVideoFile(file)) return;
  if (isAllowedStudioAudioFile(file)) return;
  if (isAllowedStudioImageFile(file)) return;

  const mime = normalizeMime(file.type || "");
  const ext = fileExtensionLower(file);
  const looksVideo =
    mime.startsWith("video/") || VIDEO_EXTS.has(ext) || ext === ".m4v" || ext === ".avi";
  const looksAudio = mime.startsWith("audio/") || AUDIO_EXTS.has(ext);
  const looksImage = mime.startsWith("image/") || IMAGE_EXTS.has(ext);

  if (looksVideo) {
    throw new Error(
      `Unsupported video format (${ext || mime}). ${FORMAT_HINT_VIDEO}`,
    );
  }
  if (looksAudio) {
    throw new Error(
      `Unsupported audio format (${ext || mime}). ${FORMAT_HINT_AUDIO}`,
    );
  }
  if (looksImage) {
    throw new Error(
      `Unsupported image format (${ext || mime}). ${FORMAT_HINT_IMAGE}`,
    );
  }
  throw new Error(`${FORMAT_HINT_IMAGE} ${FORMAT_HINT_VIDEO} ${FORMAT_HINT_AUDIO}`);
}
