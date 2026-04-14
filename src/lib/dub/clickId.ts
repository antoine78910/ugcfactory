/** Dub click id from `dub_id` cookie or client (alphanumeric + `_` `-`). */
export function normalizeDubClickId(raw: string | undefined | null): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  if (!s) return "";
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  s = s.trim();
  if (s.length > 256) return "";
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return "";
  return s;
}
