/**
 * Shared upload rules (Studio, Link to Ad, motion, API /uploads).
 * HEIC/HEIF are rejected with an explicit French message (common iPhone issue).
 */

export const STUDIO_IMAGE_FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";

export const STUDIO_VIDEO_FILE_ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";

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

export const FORMAT_HINT_IMAGE_FR =
  "Formats acceptés : JPEG, PNG, WebP ou GIF (pas HEIC — convertis depuis l’iPhone ou un outil en ligne).";

export const FORMAT_HINT_VIDEO_FR = "Formats acceptés : MP4, MOV ou WebM.";

export const HEIC_NOT_SUPPORTED_FR =
  "Le format HEIC / HEIF n’est pas pris en charge. Exporte en JPEG ou PNG (Réglages iPhone > Appareil photo > Formats > « Le plus compatible »), ou convertis le fichier avant l’envoi.";

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

export function assertStudioImageUpload(file: File): void {
  if (isHeicLike(file)) {
    throw new Error(HEIC_NOT_SUPPORTED_FR);
  }
  if (isAllowedStudioImageFile(file)) return;
  const ext = fileExtensionLower(file);
  const mime = normalizeMime(file.type || "");
  if (mime.startsWith("image/") || ext) {
    throw new Error(
      `Format d’image non pris en charge (${ext || mime || "?"}). ${FORMAT_HINT_IMAGE_FR}`,
    );
  }
  throw new Error(`Impossible de reconnaître l’image. ${FORMAT_HINT_IMAGE_FR}`);
}

export function assertStudioVideoUpload(file: File): void {
  if (isHeicLike(file)) {
    throw new Error(
      "Ce fichier ressemble à une photo HEIC, pas à une vidéo. " + HEIC_NOT_SUPPORTED_FR,
    );
  }
  if (isAllowedStudioVideoFile(file)) return;
  const ext = fileExtensionLower(file);
  const mime = normalizeMime(file.type || "");
  if (mime.startsWith("video/") || ext === ".m4v" || ext === ".avi") {
    throw new Error(
      `Format vidéo non pris en charge (${ext || mime || "?"}). ${FORMAT_HINT_VIDEO_FR}`,
    );
  }
  throw new Error(`Format vidéo non reconnu. ${FORMAT_HINT_VIDEO_FR}`);
}

export function assertStudioUploadForKind(file: File, kind: "image" | "video"): void {
  if (kind === "video") assertStudioVideoUpload(file);
  else assertStudioImageUpload(file);
}

export function inferStudioUploadKind(file: File): "image" | "video" {
  const mime = normalizeMime(file.type || "");
  const ext = fileExtensionLower(file);
  if (mime.startsWith("video/") || VIDEO_EXTS.has(ext)) return "video";
  return "image";
}

/** `/api/uploads`: multipart file must be an allowed image or video. */
export function assertGenericMultipartUpload(file: File): void {
  if (isHeicLike(file)) {
    throw new Error(HEIC_NOT_SUPPORTED_FR);
  }
  if (isAllowedStudioVideoFile(file)) return;
  if (isAllowedStudioImageFile(file)) return;

  const mime = normalizeMime(file.type || "");
  const ext = fileExtensionLower(file);
  const looksVideo =
    mime.startsWith("video/") || VIDEO_EXTS.has(ext) || ext === ".m4v" || ext === ".avi";
  const looksImage = mime.startsWith("image/") || IMAGE_EXTS.has(ext);

  if (looksVideo) {
    throw new Error(
      `Format vidéo non pris en charge (${ext || mime}). ${FORMAT_HINT_VIDEO_FR}`,
    );
  }
  if (looksImage) {
    throw new Error(
      `Format d’image non pris en charge (${ext || mime}). ${FORMAT_HINT_IMAGE_FR}`,
    );
  }
  throw new Error(`${FORMAT_HINT_IMAGE_FR} ${FORMAT_HINT_VIDEO_FR}`);
}
