export const runtime = "nodejs";
export const maxDuration = 180;

import { NextResponse } from "next/server";

import { claudeAnalyzeBrandSite } from "@/lib/onboardingBrandClaude";
import { crawlSiteForOnboarding, normalizeBrandSiteUrl } from "@/lib/onboardingSiteCrawler";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Body = {
  siteUrl?: unknown;
  siteName?: unknown;
};

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const siteUrlRaw = typeof body.siteUrl === "string" ? body.siteUrl.trim() : "";
  if (!siteUrlRaw) {
    return NextResponse.json({ error: "Missing siteUrl" }, { status: 400 });
  }

  const siteName = typeof body.siteName === "string" ? body.siteName.trim() : "";

  try {
    const siteUrl = normalizeBrandSiteUrl(siteUrlRaw);
    const { pages, errors } = await crawlSiteForOnboarding(siteUrlRaw);
    if (pages.length === 0) {
      return NextResponse.json(
        { error: "Could not fetch any HTML pages from this URL.", crawlErrors: errors },
        { status: 422 },
      );
    }

    const { analysis, marketingAngles } = await claudeAnalyzeBrandSite({
      siteUrl,
      siteName: siteName || null,
      pages,
    });

    return NextResponse.json({
      siteUrl,
      siteName: siteName || null,
      sitePages: pages,
      crawlErrors: errors,
      siteAnalysis: analysis,
      marketingAngles,
      model: "claude-sonnet-4-6",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Site analysis failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
