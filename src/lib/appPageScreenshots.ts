import { serverLog } from "@/lib/serverLog";

/**
 * Whether Playwright fallbacks are enabled. Mirrors the toggle in
 * `storeExtractFetch.ts` so a single env var disables every server-side browser.
 */
const PLAYWRIGHT_ENABLED = process.env.PLAYWRIGHT_FALLBACK !== "false";

/**
 * Total time budget for a single capture call (browser launch + nav + screenshots).
 * App landing pages can be heavy (custom fonts, hero videos), so we give it more
 * headroom than the simple HTML extract (~22s).
 */
const CAPTURE_BUDGET_MS = 45_000;
/** Per-page navigation timeout. We retry once with `domcontentloaded` if `load` times out. */
const NAV_TIMEOUT_MS = 18_000;
/** Idle wait after navigation so JS-rendered hero sections render before we shoot. */
const POST_LOAD_DELAY_MS = 1_400;

const COMMON_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Mobile UA mimics a recent iPhone Safari. Some sites serve mobile-only layouts only when the UA matches. */
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

export type AppViewportSpec = {
  /** Stable identifier used in storage paths and logs. */
  kind: "desktop" | "mobile";
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent: string;
};

/**
 * Default mobile + desktop viewport pair. Tuned for a balance between fidelity
 * (Retina pixel density) and Supabase Storage size (well under 4 MB per shot).
 *
 * - Desktop: 1440×900 @ 1× DPR — common laptop width that exposes "above-the-fold" hero sections.
 * - Mobile : iPhone 14 (390×844) @ 2× DPR — typical modern iPhone, triggers `@media (hover: none)`.
 */
export const DEFAULT_APP_VIEWPORTS: readonly AppViewportSpec[] = [
  {
    kind: "desktop",
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent: COMMON_USER_AGENT,
  },
  {
    kind: "mobile",
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: MOBILE_USER_AGENT,
  },
];

export type CapturedAppShot = {
  kind: "desktop" | "mobile";
  width: number;
  height: number;
  buffer: Buffer;
  contentType: "image/jpeg";
};

export type CaptureAppShotsResult =
  | { ok: true; shots: CapturedAppShot[] }
  | { ok: false; code: "PLAYWRIGHT_DISABLED" | "PLAYWRIGHT_MISSING" | "TIMEOUT" | "NAV_FAILED" | "UNKNOWN"; message: string };

/**
 * Capture mobile + laptop renders of an app URL via headless Chromium.
 *
 * Returns JPEG buffers (quality 82) so we can upload them to Supabase Storage
 * directly without re-encoding. The function is best-effort: if Playwright is
 * unavailable or the page fails to load, it returns an error result instead of
 * throwing — callers should treat screenshots as optional reference material.
 *
 * Implementation notes:
 * - We use a single Chromium process and create one BrowserContext per viewport
 *   so mobile and desktop don't share cookies/UA.
 * - We try `waitUntil: "load"` first, then fall back to `domcontentloaded` on
 *   timeout — heavy SPAs sometimes never fire `load` because of long-poll
 *   analytics, but the visible hero section is already painted.
 */
export async function captureAppPageScreenshots(
  pageUrl: string,
  viewports: readonly AppViewportSpec[] = DEFAULT_APP_VIEWPORTS,
): Promise<CaptureAppShotsResult> {
  if (!PLAYWRIGHT_ENABLED) {
    return { ok: false, code: "PLAYWRIGHT_DISABLED", message: "Playwright fallback is disabled on this host." };
  }

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    serverLog("app_screenshot_playwright_missing", {
      url: pageUrl.slice(0, 160),
      message: err instanceof Error ? err.message : "import failed",
    });
    return {
      ok: false,
      code: "PLAYWRIGHT_MISSING",
      message:
        "Playwright is not installed on this host. Run `npm i playwright` and `npx playwright install chromium`.",
    };
  }

  const startedAt = Date.now();
  let browser: import("playwright").Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true, timeout: 12_000 });
  } catch (err) {
    serverLog("app_screenshot_browser_launch_failed", {
      url: pageUrl.slice(0, 160),
      message: err instanceof Error ? err.message : "launch failed",
    });
    return { ok: false, code: "UNKNOWN", message: "Could not launch headless Chromium." };
  }

  const shots: CapturedAppShot[] = [];
  try {
    for (const viewport of viewports) {
      if (Date.now() - startedAt > CAPTURE_BUDGET_MS) {
        return {
          ok: false,
          code: "TIMEOUT",
          message: "Screenshot capture exceeded the time budget. Try again or use a lighter URL.",
        };
      }
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        userAgent: viewport.userAgent,
        locale: "en-US",
        extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
      });
      const page = await context.newPage();
      try {
        try {
          await page.goto(pageUrl, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
        } catch {
          // Some SPAs never fire `load` (long-poll analytics, web sockets); fall back to DOM ready.
          await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
        }
        // Force-paint: scroll to top, wait for late hero images to swap in.
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
        await page.waitForTimeout(POST_LOAD_DELAY_MS);

        const buffer = await page.screenshot({
          type: "jpeg",
          quality: 82,
          fullPage: false,
        });
        shots.push({
          kind: viewport.kind,
          width: viewport.width,
          height: viewport.height,
          buffer: Buffer.from(buffer),
          contentType: "image/jpeg",
        });
      } catch (err) {
        serverLog("app_screenshot_capture_failed", {
          url: pageUrl.slice(0, 160),
          viewport: viewport.kind,
          message: err instanceof Error ? err.message : "screenshot failed",
        });
        const aborted =
          err instanceof Error &&
          (err.name === "TimeoutError" || /timeout/i.test(err.message));
        if (aborted) {
          return {
            ok: false,
            code: "NAV_FAILED",
            message: `Could not load the URL on ${viewport.kind} (timeout). Try a lighter or non-blocked URL.`,
          };
        }
        return {
          ok: false,
          code: "UNKNOWN",
          message: `Could not capture the ${viewport.kind} screenshot.`,
        };
      } finally {
        await page.close().catch(() => undefined);
        await context.close().catch(() => undefined);
      }
    }

    return { ok: true, shots };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
