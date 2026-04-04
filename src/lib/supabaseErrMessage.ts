/** Supabase / PostgREST errors are plain objects with `message`, not `Error` instances. */
export function supabaseErrMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return "Database error.";
}

export function isPostgrestNoRows(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "PGRST116";
}
