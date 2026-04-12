import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { studioGenerationModelDisplayLabel } from "@/lib/studioGenerationsMap";
import { STUDIO_GENERATION_KIND_STUDIO_TRANSLATE_VIDEO } from "@/lib/studioGenerationKinds";

const STORAGE_KEY = "ugc_translate_pending_v1";
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type TranslatePendingJob = {
  taskId: string;
  label: string;
  model: string;
  language: string;
  provider: string;
  inputUrls?: string[];
  creditsCharged: number;
  startedAt: number;
  /** Set after a successful `studio_generations` register (or repair). */
  rowId?: string | null;
};

function safeParse(raw: string | null): TranslatePendingJob[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is TranslatePendingJob =>
        x != null &&
        typeof x === "object" &&
        typeof (x as TranslatePendingJob).taskId === "string" &&
        (x as TranslatePendingJob).taskId.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function readTranslatePendingJobs(): TranslatePendingJob[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const now = Date.now();
    const all = safeParse(localStorage.getItem(STORAGE_KEY));
    const fresh = all.filter((j) => now - j.startedAt < MAX_AGE_MS);
    if (fresh.length !== all.length) writeTranslatePendingJobs(fresh);
    return fresh;
  } catch {
    return [];
  }
}

export function writeTranslatePendingJobs(jobs: TranslatePendingJob[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    /* quota / private mode */
  }
}

export function upsertTranslatePendingJob(job: TranslatePendingJob): void {
  const rest = readTranslatePendingJobs().filter((j) => j.taskId !== job.taskId);
  writeTranslatePendingJobs([job, ...rest]);
}

export function patchTranslatePendingJob(
  taskId: string,
  patch: Partial<Pick<TranslatePendingJob, "rowId">>,
): void {
  const list = readTranslatePendingJobs();
  const i = list.findIndex((j) => j.taskId === taskId);
  if (i < 0) return;
  list[i] = { ...list[i]!, ...patch };
  writeTranslatePendingJobs(list);
}

export function removeTranslatePendingJob(taskId: string): void {
  writeTranslatePendingJobs(readTranslatePendingJobs().filter((j) => j.taskId !== taskId));
}

/** Synthetic history rows for in-flight translate jobs not yet (or not) returned by GET. */
export function translatePendingJobsToHistoryItems(jobs: TranslatePendingJob[]): StudioHistoryItem[] {
  return jobs.map((p) => {
    const modelLabel = studioGenerationModelDisplayLabel(
      STUDIO_GENERATION_KIND_STUDIO_TRANSLATE_VIDEO,
      p.model || undefined,
    );
    return {
      id: p.rowId?.trim() || `pending-translate:${p.taskId}`,
      kind: "video" as const,
      status: "generating" as const,
      label: p.label || "Translation",
      createdAt: p.startedAt,
      studioGenerationKind: STUDIO_GENERATION_KIND_STUDIO_TRANSLATE_VIDEO,
      inputUrls: p.inputUrls?.length ? p.inputUrls : undefined,
      model: p.model || undefined,
      ...(modelLabel ? { modelLabel } : {}),
      externalTaskId: p.taskId,
      studioGenerationId: p.rowId?.trim() || undefined,
    };
  });
}

/**
 * Merge server list with pending localStorage jobs (dedupe by externalTaskId or row id).
 */
export function mergeServerHistoryWithTranslatePending(
  serverItems: StudioHistoryItem[],
  pending: TranslatePendingJob[],
): StudioHistoryItem[] {
  const serverTaskIds = new Set(
    serverItems.map((i) => i.externalTaskId?.trim()).filter((x): x is string => Boolean(x)),
  );
  const serverRowIds = new Set(serverItems.map((i) => i.id).filter(Boolean));

  const extras: StudioHistoryItem[] = [];
  for (const p of pending) {
    if (serverTaskIds.has(p.taskId)) continue;
    if (p.rowId && serverRowIds.has(p.rowId)) continue;
    extras.push(translatePendingJobsToHistoryItems([p])[0]!);
  }
  if (extras.length === 0) return serverItems;
  return [...serverItems, ...extras].sort((a, b) => b.createdAt - a.createdAt);
}
