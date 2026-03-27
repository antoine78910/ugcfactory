export function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
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

