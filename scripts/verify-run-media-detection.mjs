/**
 * Smoke test for the `looksLikeProviderMediaUrl` heuristic.
 * Mirrors the implementation in `src/lib/runMediaPersistence.ts` to validate the
 * detection rules without needing a TS toolchain. Update both when adding hosts.
 *
 * Run with: node scripts/verify-run-media-detection.mjs
 */

function isOurSupabaseStorageUrl(url) {
  return /\/storage\/v1\/object\/(public|sign)\//i.test(url);
}

function isEphemeralOrUnstableMediaUrl(url) {
  const u = String(url ?? "").trim().toLowerCase();
  if (!u || !/^https?:\/\//i.test(u)) return false;
  if (u.includes("theapi.app")) return true;
  if (u.includes("/ephemeral/")) return true;
  if (u.includes("temp.") && u.includes("cdn")) return true;
  return false;
}

function looksLikeProviderMediaUrl(url) {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false;
  if (isOurSupabaseStorageUrl(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  const beforeQuery = lower.split(/[?#]/)[0];
  if (/\.(png|jpe?g|webp|gif|svg|mp4|mov|webm|m4a|mp3|wav|ogg)$/i.test(beforeQuery)) return true;
  if (isEphemeralOrUnstableMediaUrl(trimmed)) return true;
  if (lower.includes("fal.media")) return true;
  if (lower.includes("delivery-eu1.bfl.ai")) return true;
  if (lower.includes("replicate.delivery")) return true;
  if (lower.includes("klingai.com")) return true;
  if (lower.includes("kuaishou-ai")) return true;
  if (lower.includes("kie.ai/files")) return true;
  if (lower.includes("kie-cdn.")) return true;
  if (lower.includes("piapi-")) return true;
  if (lower.includes("img.bytedance")) return true;
  if (lower.includes("ark-content-generation")) return true;
  if (lower.includes("oaiusercontent.com")) return true;
  if (lower.includes("openai-labs")) return true;
  return false;
}

const cases = [
  ["https://img.theapi.app/ephemeral/abc.png", true, "PiAPI ephemeral image"],
  ["https://img.theapi.app/ephemeral/abc.mp4", true, "PiAPI ephemeral video"],
  ["https://v3.fal.media/files/foo/bar.jpg", true, "fal media"],
  ["https://replicate.delivery/yhqm/abc.mp4", true, "Replicate delivery"],
  ["https://kie-cdn.example.com/output/x.png", true, "KIE CDN"],
  ["https://piapi-output-temp-cdn.com/abc.mp4", true, "piapi-output CDN"],
  ["https://oaiusercontent.com/file-abc.png", true, "OpenAI CDN"],
  ["https://example.com/some-video.mp4", true, "generic .mp4 extension"],
  ["https://s3.amazonaws.com/bucket/file.png", true, "S3 png extension"],
  ["https://abcd.supabase.co/storage/v1/object/public/studio-media/u/r/x.png", false, "studio-media public"],
  ["https://abcd.supabase.co/storage/v1/object/public/ugc-uploads/u/file.jpg", false, "ugc-uploads public"],
  ["https://abcd.supabase.co/storage/v1/object/sign/studio-media/u/r/x.mp4?token=abc", false, "studio-media signed"],
  ["https://shop.example.com/products/123", false, "product page (no extension)"],
  ["https://app.youry.io/link-to-ad?project=abc", false, "internal app URL"],
  ["", false, "empty string"],
  ["not-a-url", false, "non-URL string"],
  ["https://cdn.example.com/abc.png?token=xyz", true, "extension before query string"],
  ["https://cdn.example.com/abc.PNG", true, "uppercase extension"],
];

let ok = 0;
let fail = 0;
for (const [url, expected, label] of cases) {
  const got = looksLikeProviderMediaUrl(url);
  const status = got === expected ? "PASS" : "FAIL";
  if (got === expected) ok++;
  else fail++;
  console.log(`[${status}] ${label}: ${url} -> ${got} (expected ${expected})`);
}

console.log(`\n${ok} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
