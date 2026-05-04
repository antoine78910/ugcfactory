/**
 * Downscale large reference images in the browser before upload (faster upload, less bandwidth).
 * Skips GIF (animation) and very small files.
 */
const MIN_BYTES_TO_COMPRESS = 350 * 1024;
const MAX_EDGE_PX = 2048;
const JPEG_QUALITY = 0.86;

export async function compressImageFileForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size < MIN_BYTES_TO_COMPRESS) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width: iw, height: ih } = bitmap;
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
    });
    if (!blob || blob.size === 0) return file;

    // Keep original if compression did not help meaningfully (avoid quality loss for tiny savings).
    if (blob.size >= file.size * 0.92) return file;

    const base = (file.name || "ref").replace(/\.[^.]+$/i, "") || "ref";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
