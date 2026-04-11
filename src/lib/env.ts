export function getEnv(name: string): string | undefined {
  const v = process.env[name];
  if (v == null) return undefined;
  const t = typeof v === "string" ? v.trim() : String(v).trim();
  return t.length > 0 ? t : undefined;
}

export function requireEnv(name: string): string {
  const v = getEnv(name);
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export function getAppUrl(): string {
  const url =
    getEnv("APP_URL") ??
    getEnv("NEXT_PUBLIC_APP_URL") ??
    "http://localhost:3000";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

