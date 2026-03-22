/** Non-empty user-provided Kie API key: subscription tier checks are skipped (user bills Kie directly). */
export function hasPersonalApiKey(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
