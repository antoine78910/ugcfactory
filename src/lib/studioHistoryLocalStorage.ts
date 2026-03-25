import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";

const MAX_ITEMS = 80;

function isValidHistoryItem(x: unknown): x is StudioHistoryItem {
  return (
    x != null &&
    typeof x === "object" &&
    typeof (x as StudioHistoryItem).id === "string" &&
    typeof (x as StudioHistoryItem).createdAt === "number"
  );
}

export function readStudioHistoryLocal(key: string): StudioHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidHistoryItem);
  } catch {
    return [];
  }
}

export function writeStudioHistoryLocal(key: string, items: StudioHistoryItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* quota / private mode */
  }
}
