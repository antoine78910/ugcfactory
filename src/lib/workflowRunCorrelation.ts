/**
 * Persist a client-generated run id inside `studio_generations.label` so workflow polling
 * (especially race recovery without task ids yet) never attaches another user's/tab's job rows.
 *
 * Stored as trailing `__WFRUN__<uuid-v4>__`; stripped again for Studio history UI.
 */

const WORKFLOW_RUN_CORRELATION_RE = /__WFRUN__([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})__$/i;

export function appendWorkflowRunCorrelationToLabel(baseLabel: string, correlationId?: string | null): string {
  const id = correlationId?.trim();
  const strippedBase = stripWorkflowRunCorrelationFromLabel(baseLabel.trim());
  if (!id) return strippedBase || baseLabel;
  return `${strippedBase}__WFRUN__${id}__`;
}

export function parseWorkflowRunCorrelationFromLabel(label: string | null | undefined): string | null {
  const m = WORKFLOW_RUN_CORRELATION_RE.exec((label ?? "").trim());
  return m?.[1] ?? null;
}

export function stripWorkflowRunCorrelationFromLabel(label: string): string {
  return label.replace(WORKFLOW_RUN_CORRELATION_RE, "").trimEnd();
}
