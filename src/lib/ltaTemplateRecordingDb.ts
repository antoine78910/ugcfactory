/** PostgREST / Supabase client error when the table is missing or not yet in the API schema cache. */
export function isMissingLtaTemplateTableError(message: string | null | undefined): boolean {
  const msg = (message ?? "").toLowerCase();
  if (!msg) return false;
  if (msg.includes("schema cache") && msg.includes("lta_template")) return true;
  if (msg.includes("relation") && msg.includes("does not exist") && msg.includes("lta_template")) {
    return true;
  }
  if (msg.includes("pgrst205")) return true;
  return false;
}
