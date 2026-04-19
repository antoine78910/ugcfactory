/** UUID v4 shape, matches `studio_generations.id` from Supabase. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isStudioGenerationRowId(id: string): boolean {
  return typeof id === "string" && UUID_RE.test(id.trim());
}
