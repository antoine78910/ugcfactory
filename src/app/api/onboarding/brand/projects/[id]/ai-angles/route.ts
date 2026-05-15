export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";

import {
  buildBrandProjectInsights,
  normalizeAiAngles,
  parseCompetitorRow,
  type AngleScore,
} from "@/lib/brandProjectInsights";
import { claudeMessagesText } from "@/lib/claudeResponses";
import { ONBOARDING_BRAND_MODEL } from "@/lib/onboardingBrandClaude";
import { parseJsonObject } from "@/lib/onboardingJson";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { deleteCached, getCached, setCached } from "@/lib/trendtrackCache";

const AI_ANGLES_TTL = 60 * 60 * 24 * 7;

function cacheKey(projectId: string) {
  return `brand_project:${projectId}:ai_market_angles:v1`;
}

function buildPrompt(ads: Array<{ hook: string; script: string; competitor: string }>): string {
  const lines = ads
    .slice(0, 28)
    .map((a, i) => `[${i + 1}] (${a.competitor}) hook: "${a.hook.slice(0, 100)}" | script: "${a.script.slice(0, 160)}"`)
    .join("\n");

  return `Analyze competitor ad hooks/scripts and infer dominant creative marketing angles.

Return ONLY JSON:
{"angles":[{"label":"Social proof","pct":32},{"label":"UGC demo","pct":28}]}

Rules:
- 4 to 6 angles, pct sums to 100, English labels (2-4 words)
- Base distribution on which angles appear to convert (use reach as proxy when implied by ordering)
- No markdown

Ads:
${lines}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const { id: projectId } = await ctx.params;
  if (!projectId) return NextResponse.json({ error: "Missing project id." }, { status: 400 });

  let force = false;
  try {
    const body = (await req.json()) as { force?: unknown };
    force = body.force === true;
  } catch {
    /* empty body ok */
  }

  const key = cacheKey(projectId);
  if (force) await deleteCached(key);

  const cached = await getCached<AngleScore[]>(key);
  if (cached && cached.length > 0) {
    return NextResponse.json({ angles: cached, cached: true, source: "cache" });
  }

  const { data: row, error } = await auth.supabase!
    .from("brand_projects")
    .select("marketing_angles, competitors")
    .eq("id", projectId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const competitors = Array.isArray(row.competitors) ? row.competitors : [];
  const ads: Array<{ hook: string; script: string; competitor: string }> = [];

  for (const raw of competitors) {
    const c = parseCompetitorRow(raw);
    if (!c) continue;
    for (const ad of c.trendtrack_ads) {
      const hook = (ad.headline ?? ad.title ?? "").trim();
      const script = (ad.body ?? ad.text ?? "").trim();
      if (!hook && !script) continue;
      ads.push({
        hook: hook || script.slice(0, 80),
        script: script || hook,
        competitor: c.input_name,
      });
    }
  }

  if (ads.length === 0) {
    return NextResponse.json(
      { error: "No competitor ad samples on this project. Refresh competitors or re-run onboarding." },
      { status: 400 },
    );
  }

  try {
    const text = await claudeMessagesText({
      user: buildPrompt(ads),
      model: ONBOARDING_BRAND_MODEL,
      maxTokens: 512,
    });
    const parsed = parseJsonObject(text) as { angles?: unknown };
    const angles = normalizeAiAngles(parsed.angles);
    if (angles.length === 0) {
      return NextResponse.json({ error: "AI returned no angles." }, { status: 502 });
    }

    await setCached(key, angles, AI_ANGLES_TTL);

    const marketingAngles = Array.isArray(row.marketing_angles) ? row.marketing_angles : [];
    const insights = buildBrandProjectInsights({
      marketingAngles: marketingAngles as Parameters<typeof buildBrandProjectInsights>[0]["marketingAngles"],
      competitors,
      aiMarketAngles: angles,
    });

    return NextResponse.json({ angles, insights, cached: false, source: "claude" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI analysis failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
