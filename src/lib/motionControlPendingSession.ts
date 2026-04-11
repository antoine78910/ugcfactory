import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { studioGenerationModelDisplayLabel } from "@/lib/studioGenerationsMap";

const STORAGE_KEY = "ugc_motion_pending_v1";
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type MotionPendingSessionJob = {
  taskId: string;
  label: string;
  model: string;
  kind: string;
  provider: string;
  inputUrls?: string[];
  creditsCharged: number;
  startedAt: number;
  /** Set after a successful `studio_generations` register (or repair). */
  rowId?: string | null;
};

function safeParse(raw: string | null): MotionPendingSessionJob[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is MotionPendingSessionJob =>
        x &&
        typeof x === "object" &&
        typeof (x as MotionPendingSessionJob).taskId === "string" &&
        (x as MotionPendingSessionJob).taskId.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function readMotionPendingJobs(): MotionPendingSessionJob[] {
  if (typeof sessionStorage === "undefined") return [];
  const now = Date.now();
  const list = safeParse(sessionStorage.getItem(STORAGE_KEY)).filter((j) => now - j.startedAt < MAX_AGE_MS);
  if (list.length !== safeParse(sessionStorage.getItem(STORAGE_KEY)).length) {
    writeMotionPendingJobs(list);
  }
  return list;
}

export function writeMotionPendingJobs(jobs: MotionPendingSessionJob[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    /* quota / private mode */
  }
}

export function upsertMotionPendingJob(job: MotionPendingSessionJob): void {
  const rest = readMotionPendingJobs().filter((j) => j.taskId !== job.taskId);
  writeMotionPendingJobs([job, ...rest]);
}

export function patchMotionPendingJob(
  taskId: string,
  patch: Partial<Pick<MotionPendingSessionJob, "rowId">>,
): void {
  const list = readMotionPendingJobs();
  const i = list.findIndex((j) => j.taskId === taskId);
  if (i < 0) return;
  list[i] = { ...list[i]!, ...patch };
  writeMotionPendingJobs(list);
}

export function removeMotionPendingJob(taskId: string): void {
  writeMotionPendingJobs(readMotionPendingJobs().filter((j) => j.taskId !== taskId));
}

/** Synthetic history rows for in-flight motion jobs not yet (or not) returned by GET. */
export function motionPendingJobsToHistoryItems(jobs: MotionPendingSessionJob[]): StudioHistoryItem[] {
  return jobs.map((p) => {
    const modelLabel = studioGenerationModelDisplayLabel(p.kind, p.model || undefined);
    return {
      id: p.rowId?.trim() || `pending-motion:${p.taskId}`,
      kind: "motion" as const,
      status: "generating" as const,
      label: p.label || "Motion control",
      createdAt: p.startedAt,
      studioGenerationKind: p.kind,
      inputUrls: p.inputUrls?.length ? p.inputUrls : undefined,
      model: p.model || undefined,
      ...(modelLabel ? { modelLabel } : {}),
      externalTaskId: p.taskId,
      studioGenerationId: p.rowId?.trim() || undefined,
    };
  });
}

/**
 * Merge server list with pending session jobs (dedupe by `externalTaskId` or row id).
 */
export function mergeServerHistoryWithMotionPending(
  serverItems: StudioHistoryItem[],
  pending: MotionPendingSessionJob[],
): StudioHistoryItem[] {
  const serverTaskIds = new Set(
    serverItems.map((i) => i.externalTaskId?.trim()).filter((x): x is string => Boolean(x)),
  );
  const serverRowIds = new Set(serverItems.map((i) => i.id).filter(Boolean));

  const extras: StudioHistoryItem[] = [];
  for (const p of pending) {
    if (serverTaskIds.has(p.taskId)) continue;
    if (p.rowId && serverRowIds.has(p.rowId)) continue;
    extras.push(motionPendingJobsToHistoryItems([p])[0]!);
  }
  if (extras.length === 0) return serverItems;
  return [...serverItems, ...extras].sort((a, b) => b.createdAt - a.createdAt);
}
