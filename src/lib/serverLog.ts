/**
 * Single-line JSON logs for Railway / container stdout (grep-friendly).
 */
export function serverLog(event: string, fields?: Record<string, unknown>): void {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    event,
    ...(fields ?? {}),
  };
  console.log(JSON.stringify(payload));
}
