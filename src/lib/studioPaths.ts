export type AppSection =
  | "link_to_ad"
  | "avatar"
  | "ad_clone"
  | "voice"
  | "motion_control"
  | "image"
  | "video"
  | "upscale"
  | "projects";

export type TranslateToolMode = "video_translate" | "voice_change";
export type VoiceToolMode = "voice_change";

export const SECTION_TO_SLUG: Record<AppSection, string> = {
  link_to_ad: "link-to-ad",
  avatar: "avatar",
  ad_clone: "translate",
  voice: "voice",
  motion_control: "motion-control",
  image: "image",
  video: "video",
  upscale: "upscale",
  projects: "my-projects",
};

const SLUG_TO_SECTION: Record<string, AppSection> = Object.fromEntries(
  Object.entries(SECTION_TO_SLUG).map(([k, v]) => [v, k]),
) as Record<string, AppSection>;

/** Derive the active section from the pathname (with or without a legacy `/app` prefix). */
export function sectionFromPathname(pathname: string): AppSection {
  const stripped = pathname.replace(/^\/app\/?/, "");
  const first = stripped.split("/").filter(Boolean)[0] ?? "";
  if (first === "watermark") return "video";
  return SLUG_TO_SECTION[first] ?? "link_to_ad";
}

/** Brand / store URL segment after `/my-projects/…`, or null on the list route. */
export function projectBrandFromPathname(pathname: string): string | null {
  const stripped = pathname.replace(/^\/app\/?/, "");
  const segs = stripped.split("/").filter(Boolean);
  if (segs[0] !== "my-projects" || segs.length < 2) return null;
  const encoded = segs.slice(1).join("/");
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function translateModeFromPathname(pathname: string): TranslateToolMode | null {
  const stripped = pathname.replace(/^\/app\/?/, "");
  const segs = stripped.split("/").filter(Boolean);
  if (segs[0] !== "translate") return null;
  return "video_translate";
}

export function voiceModeFromPathname(pathname: string): VoiceToolMode | null {
  const stripped = pathname.replace(/^\/app\/?/, "");
  const segs = stripped.split("/").filter(Boolean);
  if (segs[0] !== "voice") return null;
  return "voice_change";
}

/**
 * Path for the studio shell (no `/app` prefix; middleware rewrites to `/app/...` on the app host).
 * For My Projects with a selected brand, `/my-projects/<encodeURIComponent(storeUrl)>`.
 */
export function sectionToPath(
  section: AppSection,
  projectNormalizedUrl?: string | null,
  extra?: string,
): string {
  const slug = SECTION_TO_SLUG[section] ?? "link-to-ad";
  if (section === "projects" && projectNormalizedUrl) {
    return `/my-projects/${encodeURIComponent(projectNormalizedUrl)}`;
  }
  let path = `/${slug}`;
  if (extra) path += `/${extra}`;
  return path;
}

/** Studio sidebar + shell: paths that use the `[...sections]` page (not subscription, auth, etc.). */
export function isStudioShellPath(pathname: string): boolean {
  const stripped = pathname.replace(/^\/app\/?/, "/");
  const first = stripped.split("/").filter(Boolean)[0] ?? "";
  if (!first) return true;
  if (first === "watermark") return true;
  if (first === "workflow") return true;
  return first in SLUG_TO_SECTION;
}

/** Credits / subscription pages use StudioShell but no CREATE row should look selected. */
export function isCreditsOrSubscriptionPath(pathname: string): boolean {
  const stripped = pathname.replace(/^\/app\/?/, "");
  const first = stripped.split("/").filter(Boolean)[0] ?? "";
  return first === "credits" || first === "subscription";
}

/**
 * True for studio tool routes (`/link-to-ad`, `/video`, `/workflow`, …) but not bare `/`
 * (marketing home) or `/subscription` / `/onboarding`.
 */
export function isStudioToolPath(pathname: string): boolean {
  const stripped = pathnameWithoutLegacyAppPrefix(pathname);
  const first = stripped.split("/").filter(Boolean)[0] ?? "";
  if (!first) return false;
  if (first === "watermark") return true;
  if (first === "workflow") return true;
  return first in SLUG_TO_SECTION;
}

/**
 * Whether the pathname is the in-browser studio wizard (or legacy `/app/*`).
 * Use before syncing `history.replaceState` / pushState to public URLs without `/app`.
 */
export function isBrowserStudioWizardPath(pathname: string): boolean {
  if (pathname.startsWith("/app/") || pathname === "/app") return true;
  return isStudioShellPath(pathname);
}

/** Strip a leading `/app` segment for comparisons (legacy URLs or dev without rewrite). */
export function pathnameWithoutLegacyAppPrefix(pathname: string): string {
  if (pathname === "/app" || pathname === "/app/") return "/";
  if (pathname.startsWith("/app/")) return pathname.slice(4) || "/";
  return pathname;
}
