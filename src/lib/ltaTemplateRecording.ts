/** Minimum fake loading duration per Link to Ad step (screen recording). */
export const LTA_TEMPLATE_RECORDING_MIN_STEP_MS = 10_000;

/** Built-in allowlist when DB is unavailable or row missing. */
export const LTA_TEMPLATE_RECORDING_DEFAULT_EMAILS = new Set<string>([
  "anto.delbos@gmail.com",
  "anto.delbos@mail.com",
]);

export type LtaTemplateBrandSummary = {
  runId: string;
  normalizedUrl: string;
  storeUrl: string;
  title: string | null;
  thumbUrl: string | null;
};

export type LtaTemplateRecordingGateStep = 1 | 2 | 3 | 4;

export const LTA_TEMPLATE_RECORDING_STEP_LABELS: Record<LtaTemplateRecordingGateStep, string> = {
  1: "Store",
  2: "Scripts",
  3: "Images",
  4: "Video",
};

export function normalizeTemplateRecordingEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isDefaultTemplateRecordingEmail(email: string | null | undefined): boolean {
  const e = normalizeTemplateRecordingEmail(email);
  return Boolean(e) && LTA_TEMPLATE_RECORDING_DEFAULT_EMAILS.has(e);
}
