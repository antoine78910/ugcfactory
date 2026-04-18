#!/usr/bin/env node
/**
 * Saves `public/og-banner.png` (1200×630) from the top of the marketing home
 * (header + start of hero) for Open Graph / Discord embeds.
 *
 * Defaults to the live marketing site so it matches production without a local Host hack.
 *
 * Usage: `node scripts/capture-og-banner.mjs`
 * Env:   `OG_CAPTURE_URL` — override base URL (e.g. `http://127.0.0.1:3000` with Host forwarded by a proxy).
 */

import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const base = (process.env.OG_CAPTURE_URL ?? "https://www.youry.io").replace(
  /\/$/,
  "",
);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

try {
  await page.goto(`${base}/`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
} catch (e) {
  console.error("Navigation failed:", e?.message ?? e);
  console.error("Set OG_CAPTURE_URL or ensure the site is reachable.");
  await browser.close();
  process.exit(1);
}

await page.locator("header").first().waitFor({ state: "visible", timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));

const buf = await page.screenshot({
  type: "png",
  clip: { x: 0, y: 0, width: 1200, height: 630 },
});

const out = join(root, "public", "og-banner.png");
await writeFile(out, buf);
console.log("Wrote", out, `(${buf.length} bytes)`);

await browser.close();
