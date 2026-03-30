import { NextResponse } from "next/server";
import { serverLog } from "@/lib/serverLog";

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

const FETCH_TIMEOUT_MS = 22_000;
const RETRY_DELAY_MS = [0, 2800, 6500] as const;

/**
 * Download store HTML for extraction. Retries 429/503 a few times; maps anti-bot pages to a clear API error.
 */
export async function fetchStorePageHtmlForExtract(pageUrl: string): Promise<
  { ok: true; html: string } | { ok: false; response: NextResponse }
> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS[attempt]);
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
      const msg = err instanceof Error ? err.message : "Network error";
      const aborted =
        (err instanceof Error && err.name === "AbortError") ||
        (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError");
      if (aborted) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error:
                "The page took too long to respond. Try again, use a shorter product URL, or upload a product photo manually in Link to Ad.",
              code: "TIMEOUT",
            },
            { status: 502 },
          ),
        };
      }
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: `Could not reach this URL (${msg}). Check the link or try from another network.`,
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

    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      serverLog("store_extract_retry", {
        status: res.status,
        attempt,
        url: pageUrl.slice(0, 160),
      });
      continue;
    }

    if (looksLikeAntiBotChallengeHtml(text)) {
      serverLog("store_extract_anti_bot_error_page", { status: res.status, url: pageUrl.slice(0, 160) });
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

  throw new Error("storeExtractFetch: unexpected fallthrough");
}
