"use client";

export function clipboardImageFiles(event: ClipboardEvent): File[] {
  const dt = event.clipboardData;
  if (!dt) return [];

  const out: File[] = [];
  for (const item of Array.from(dt.items)) {
    if (!item.type || !item.type.startsWith("image/")) continue;
    const f = item.getAsFile();
    if (f) out.push(f);
  }
  return out;
}

