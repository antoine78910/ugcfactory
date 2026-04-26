export const runtime = "nodejs";
/** Headless Chromium boot + two viewports + uploads can comfortably run inside ~60s. */
export const maxDuration = 90;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { captureAppPageScreenshots, type CapturedAppShot } from "@/lib/appPageScreenshots";
import { serverLog } from "@/lib/serverLog";

/**
 * Bucket reused for all Link to Ad reference media. Must be public so the
 * captured shots can be embedded directly in downstream image-generation
 * prompts (no signed URL handshake on the model side).
 */
const STORAGE_BUCKET = "ugc-uploads";

type Body = { url?: string };

type ScreenshotsResponse = {
  url: string;
  desktopUrl: string | null;
  mobileUrl: string | null;
  desktopWidth: number | null;
  desktopHeight: number | null;
  mobileWidth: number | null;
  mobileHeight: number | null;
};

async function uploadShot(
  shot: CapturedAppShot,
  userId: string,
): Promise<{ url: string; path: string } | null> {
  const admin = createSupabaseServiceClient();
  if (!admin) return null;
  const path = `${userId}/link-to-ad/app-shot-${shot.kind}-${crypto.randomUUID()}.jpg`;
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).upload(path, shot.buffer, {
    contentType: shot.contentType,
    upsert: false,
  });
  if (error || !data) {
    serverLog("app_screenshot_upload_failed", {
      kind: shot.kind,
      message: error?.message ?? "no data",
    });
    return null;
  }
  const {
    data: { publicUrl },
  } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  return { url: publicUrl, path: data.path };
}

/**
 * POST /api/link-to-ad/app-screenshots
 *
 * Body: `{ url: string }` — must be `http(s)://`.
 *
 * Captures mobile + laptop renders of the URL using headless Chromium and
 * uploads each as a JPEG to the public `ugc-uploads` bucket so it can be fed
 * into image-generation prompts as a reference image. Errors are surfaced as
 * 4xx/5xx with a stable `code` so the caller can decide whether to retry,
 * fall back to manual upload, or give up gracefully.
 *
 * NOTE: this endpoint is currently dormant — `LINK_TO_AD_APP_OPTION_AVAILABLE`
 * gates the App switch in the UI. Wire it up when the App pipeline is enabled.
 */
export async function POST(req: Request) {
  const { user, response } = await requireSupabaseUser();
  if (response) return response;
  // Defensive: requireSupabaseUser guarantees `user` when `response` is null,
  // but TypeScript narrows via the discriminated union only on `response`.
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "Missing or invalid `url` (must start with http(s)://).", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Storage is not configured on this host (missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL).",
        code: "STORAGE_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  serverLog("app_screenshot_start", { url: url.slice(0, 160), userId: user.id });

  const captured = await captureAppPageScreenshots(url);
  if (!captured.ok) {
    const status =
      captured.code === "PLAYWRIGHT_DISABLED" || captured.code === "PLAYWRIGHT_MISSING" ? 503 : 502;
    return NextResponse.json({ error: captured.message, code: captured.code }, { status });
  }

  const desktopShot = captured.shots.find((s) => s.kind === "desktop") ?? null;
  const mobileShot = captured.shots.find((s) => s.kind === "mobile") ?? null;

  const [desktopUploaded, mobileUploaded] = await Promise.all([
    desktopShot ? uploadShot(desktopShot, user.id) : Promise.resolve(null),
    mobileShot ? uploadShot(mobileShot, user.id) : Promise.resolve(null),
  ]);

  if (!desktopUploaded && !mobileUploaded) {
    return NextResponse.json(
      {
        error: "Captured the screenshots but could not upload them to storage.",
        code: "UPLOAD_FAILED",
      },
      { status: 502 },
    );
  }

  const payload: ScreenshotsResponse = {
    url,
    desktopUrl: desktopUploaded?.url ?? null,
    mobileUrl: mobileUploaded?.url ?? null,
    desktopWidth: desktopShot?.width ?? null,
    desktopHeight: desktopShot?.height ?? null,
    mobileWidth: mobileShot?.width ?? null,
    mobileHeight: mobileShot?.height ?? null,
  };

  serverLog("app_screenshot_done", {
    url: url.slice(0, 160),
    userId: user.id,
    hasDesktop: Boolean(desktopUploaded),
    hasMobile: Boolean(mobileUploaded),
  });

  return NextResponse.json(payload);
}
