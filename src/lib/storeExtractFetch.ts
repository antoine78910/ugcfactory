import { NextResponse } from "next/server";
import { serverLog } from "@/lib/serverLog";

/** Playwright is too heavy for Vercel serverless (cold start + Chromium → FUNCTION_INVOCATION_TIMEOUT). */
const IS_VERCEL = process.env.VERCEL === "1";
const PLAYWRIGHT_ENABLED = process.env.PLAYWRIGHT_FALLBACK !== "false" && !IS_VERCEL;

/** Headers closer to a real browser; some CDNs block bare fetch. */
export const STORE_EXTRACT_BROWSER_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fr-FR,fr;q=0.8",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

export function looksLikeAntiBotChallengeHtml(html: string): boolean {
  const s = html.slice(0, 24_000);
  const lower = s.toLowerCase();
  if (lower.includes("window.kpsdk") || /\bkpsdk\b/.test(lower)) return true;
  if (lower.includes("kasada")) return true;
  if (lower.includes("__cf_chl") || lower.includes("cf-browser-verification")) return true;
  if (lower.includes("datadome")) return true;
  if (/checking your browser before accessing/i.test(s)) return true;
  if (lower.includes("just a moment") && lower.includes("cloudflare")) return true;
  if (lower.includes("attention required") && lower.includes("cloudflare")) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isFetchAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError")
  );
}

/** Keep total wall time under typical Vercel limits (60s on Pro). */
const FETCH_TIMEOUT_MS = IS_VERCEL ? 14_000 : 24_000;
const FETCH_MAX_ATTEMPTS = IS_VERCEL ? 2 : 3;
const RETRY_DELAY_MS = IS_VERCEL ? ([0, 1_200] as const) : ([0, 2_500, 5_000] as const);
const PLAYWRIGHT_GOTO_TIMEOUT_MS = 32_000;

function timeoutExtractResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "The page took too long to respond. Try again, use a direct product URL (not a long redirect chain), or upload a product photo manually in Link to Ad.",
      code: "TIMEOUT",
    },
    { status: 502 },
  );
}

/**
 * Try fetching store HTML via Playwright (headless Chromium).
 * Returns the rendered HTML string, or null if Playwright is not available / times out.
 */
export async function fetchStorePageHtmlPlaywright(pageUrl: string): Promise<string | null> {
  if (!PLAYWRIGHT_ENABLED) return null;
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, timeout: 12_000 });
    try {
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        locale: "en-US",
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const page = await context.newPage();
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: PLAYWRIGHT_GOTO_TIMEOUT_MS });
      await page.waitForTimeout(1_600);
      const html = await page.content();
      return html;
    } finally {
      await browser.close();
    }
  } catch (err) {
    serverLog("store_extract_playwright_error", {
      url: pageUrl.slice(0, 160),
      message: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

async function tryPlaywrightExtract(
  pageUrl: string,
  reason: string,
): Promise<{ ok: true; html: string; usedPlaywright: true } | null> {
  if (!PLAYWRIGHT_ENABLED) return null;
  serverLog("store_extract_playwright_attempt", { url: pageUrl.slice(0, 160), reason });
  const pwHtml = await fetchStorePageHtmlPlaywright(pageUrl);
  if (pwHtml && !looksLikeAntiBotChallengeHtml(pwHtml)) {
    serverLog("store_extract_playwright_success", { url: pageUrl.slice(0, 160), reason });
    return { ok: true, html: pwHtml, usedPlaywright: true };
  }
  serverLog("store_extract_playwright_failed", { url: pageUrl.slice(0, 160), reason });
  return null;
}

/**
 * Download store HTML for extraction. Retries slow pages and 429/503; Playwright fallback when not on Vercel.
 */
export async function fetchStorePageHtmlForExtract(pageUrl: string): Promise<
  { ok: true; html: string; usedPlaywright?: boolean } | { ok: false; response: NextResponse }
> {
  let sawTimeout = false;
  let lastNetworkError: string | null = null;

  for (let attempt = 0; attempt < FETCH_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS[attempt] ?? 2_000);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(pageUrl, {
        method: "GET",
        redirect: "follow",
        headers: STORE_EXTRACT_BROWSER_HEADERS,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (isFetchAbortError(err)) {
        sawTimeout = true;
        serverLog("store_extract_timeout", { attempt, url: pageUrl.slice(0, 160), vercel: IS_VERCEL });
        if (IS_VERCEL) break;
        if (attempt < FETCH_MAX_ATTEMPTS - 1) continue;
        break;
      }
      lastNetworkError = err instanceof Error ? err.message : "Network error";
      serverLog("store_extract_network", {
        attempt,
        url: pageUrl.slice(0, 160),
        message: lastNetworkError,
      });
      if (attempt < FETCH_MAX_ATTEMPTS - 1) continue;
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: `Could not reach this URL (${lastNetworkError}). Check the link or try from another network.`,
            code: "NETWORK",
          },
          { status: 502 },
        ),
      };
    } finally {
      clearTimeout(timeout);
    }

    const text = await res.text();

    if (res.ok) {
      if (looksLikeAntiBotChallengeHtml(text)) {
        serverLog("store_extract_anti_bot_body", { url: pageUrl.slice(0, 160), status: res.status });
        const pw = await tryPlaywrightExtract(pageUrl, "anti_bot_ok_body");
        if (pw) return pw;
        return {
          ok: false,
          response: NextResponse.json(
            {
              error:
                "This site uses bot protection (e.g. Kasada or Cloudflare) that prevents our server from reading the page HTML. Try the store’s mobile product URL, a mirror listing, or start Link to Ad and upload product photos manually instead of paste-extract.",
              code: "ANTI_BOT",
            },
            { status: 502 },
          ),
        };
      }
      return { ok: true, html: text };
    }

    if ((res.status === 429 || res.status === 503) && attempt < FETCH_MAX_ATTEMPTS - 1) {
      serverLog("store_extract_retry", {
        status: res.status,
        attempt,
        url: pageUrl.slice(0, 160),
      });
      continue;
    }

    if (looksLikeAntiBotChallengeHtml(text)) {
      serverLog("store_extract_anti_bot_error_page", { status: res.status, url: pageUrl.slice(0, 160) });
      const pw = await tryPlaywrightExtract(pageUrl, `anti_bot_http_${res.status}`);
      if (pw) return pw;
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              "The server returned a bot-protection or security page instead of the shop content (often with HTTP 429). Wait a few minutes, try again, use another product URL, or upload images manually in Link to Ad.",
            code: "ANTI_BOT",
          },
          { status: 502 },
        ),
      };
    }

    const friendly =
      res.status === 429
        ? "The shop is rate-limiting automated requests (HTTP 429). Wait several minutes, try again later, paste a different product link, or upload product images manually."
        : res.status === 403
          ? "Access was denied (HTTP 403). The site may block requests from our servers. Try another URL or add photos manually."
          : res.status === 503
            ? "The shop’s server was unavailable (HTTP 503). Retry shortly or use another link."
            : `Could not download the product page (HTTP ${res.status}).`;

    serverLog("store_extract_http_error", {
      status: res.status,
      url: pageUrl.slice(0, 160),
      preview: text.slice(0, 120).replace(/\s+/g, " "),
    });

    return {
      ok: false,
      response: NextResponse.json(
        { error: friendly, code: `HTTP_${res.status}` },
        { status: 502 },
      ),
    };
  }

  const pwFallback = await tryPlaywrightExtract(pageUrl, sawTimeout ? "fetch_timeout" : "fetch_exhausted");
  if (pwFallback) return pwFallback;

  if (sawTimeout) {
    return { ok: false, response: timeoutExtractResponse() };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: lastNetworkError
          ? `Could not reach this URL (${lastNetworkError}). Check the link or try again.`
          : "Could not download the product page after several attempts.",
        code: "NETWORK",
      },
      { status: 502 },
    ),
  };
}
