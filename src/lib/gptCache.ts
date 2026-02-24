import crypto from "crypto";

export function stableJsonStringify(value: unknown) {
  return JSON.stringify(value, Object.keys(value as any).sort());
}

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function makeCacheKey(parts: unknown) {
  const raw = JSON.stringify(parts);
  return sha256(raw);
}

