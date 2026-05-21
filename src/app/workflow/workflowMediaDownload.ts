/** Trigger a browser download for workflow media (blob/data URLs or proxied HTTPS). */
export function triggerWorkflowMediaDownload(url: string, fallbackName: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  const a = document.createElement("a");
  if (/^blob:|^data:/i.test(trimmed)) {
    a.href = trimmed;
    a.download = fallbackName;
  } else {
    a.href = `/api/download?url=${encodeURIComponent(trimmed)}`;
  }
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
