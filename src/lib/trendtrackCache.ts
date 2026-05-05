import { createSupabaseServiceClient } from "@/lib/supabase/admin";

export async function getCached<T>(key: string): Promise<T | null> {
  const sb = createSupabaseServiceClient();
  if (!sb) return null;
  const { data } = await sb
    .from("intelligence_cache")
    .select("data, expires_at")
    .eq("key", key)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data.data as T;
}

export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const sb = createSupabaseServiceClient();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await sb
    .from("intelligence_cache")
    .upsert({ key, data: value as object, expires_at: expiresAt });
}

export async function deleteCached(key: string): Promise<void> {
  const sb = createSupabaseServiceClient();
  if (!sb) return;
  await sb.from("intelligence_cache").delete().eq("key", key);
}
