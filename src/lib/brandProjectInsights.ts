import type { BrandCompetitorAnalysisRow, BrandMarketingAngle } from "@/lib/onboardingBrandClaude";

export type AngleScore = { label: string; pct: number; adCount: number; totalReach: number };

export type HookRow = {
  hook: string;
  script: string;
  platform: string;
  reach: number;
  competitorName: string;
  matchedAngle?: string;
};

export type CompetitorInsight = {
  name: string;
  domain: string | null;
  summary: string;
  anglesTheyStress: string[];
  topAds: Array<{
    hook: string;
    script: string;
    platform: string;
    reach: number;
    videoUrl?: string;
  }>;
  angleChart: AngleScore[];
  activeAds?: number;
};

export type BrandProjectInsights = {
  winningAngles: BrandMarketingAngle[];
  marketAngleChart: AngleScore[];
  topHooks: HookRow[];
  competitors: CompetitorInsight[];
  totals: {
    competitorCount: number;
    adSamples: number;
    adsWithReach: number;
  };
};

type AdLike = {
  headline?: string | null;
  title?: string | null;
  body?: string | null;
  text?: string | null;
  platform?: string | null;
  reach?: number | null;
  videoUrl?: string | null;
};

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export function extractHook(ad: AdLike): string {
  return (ad.headline ?? ad.title ?? "").trim();
}

export function extractScript(ad: AdLike): string {
  const body = (ad.body ?? ad.text ?? "").trim();
  if (body) return body.slice(0, 280);
  return extractHook(ad);
}

function angleMatchScore(angleLabel: string, hook: string, script: string): number {
  const blob = `${hook} ${script}`.toLowerCase();
  const label = angleLabel.toLowerCase();
  let score = 0;
  if (blob.includes(label)) score += 4;
  for (const tok of tokenize(angleLabel)) {
    if (blob.includes(tok)) score += 1;
  }
  return score;
}

/** Heuristic angle distribution from ad copy vs known angle labels (no API cost). */
export function scoreAdsByAngles(
  ads: Array<AdLike & { competitorName?: string }>,
  angleLabels: string[],
): AngleScore[] {
  const labels =
    angleLabels.length > 0
      ? angleLabels
      : ["Social proof", "Problem agitation", "UGC demo", "Offer / urgency", "Authority", "Other"];

  const buckets = new Map<string, { adCount: number; totalReach: number }>();
  for (const l of labels) buckets.set(l, { adCount: 0, totalReach: 0 });
  buckets.set("Other", { adCount: 0, totalReach: 0 });

  for (const ad of ads) {
    const hook = extractHook(ad);
    const script = extractScript(ad);
    if (!hook && !script) continue;

    let best = "Other";
    let bestScore = 0;
    for (const label of labels) {
      const s = angleMatchScore(label, hook, script);
      if (s > bestScore) {
        bestScore = s;
        best = label;
      }
    }

    const b = buckets.get(best) ?? { adCount: 0, totalReach: 0 };
    b.adCount += 1;
    b.totalReach += Number(ad.reach) > 0 ? Number(ad.reach) : 0;
    buckets.set(best, b);
  }

  const totalAds = [...buckets.values()].reduce((s, b) => s + b.adCount, 0) || 1;
  const rows: AngleScore[] = [];
  for (const [label, b] of buckets) {
    if (b.adCount === 0 && label === "Other") continue;
    rows.push({
      label,
      adCount: b.adCount,
      totalReach: b.totalReach,
      pct: Math.round((b.adCount / totalAds) * 100),
    });
  }

  const sum = rows.reduce((s, r) => s + r.pct, 0);
  if (sum !== 100 && rows.length > 0) {
    const top = rows.sort((a, b) => b.pct - a.pct)[0]!;
    top.pct += 100 - sum;
  }

  return rows.sort((a, b) => b.pct - a.pct);
}

export function parseCompetitorRow(raw: unknown): BrandCompetitorAnalysisRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const input_name = typeof o.input_name === "string" ? o.input_name : "";
  if (!input_name) return null;

  const claudeRaw = o.claude && typeof o.claude === "object" ? (o.claude as Record<string, unknown>) : {};
  const ads = Array.isArray(o.trendtrack_ads) ? (o.trendtrack_ads as AdLike[]) : [];

  return {
    input_name,
    input_domain: typeof o.input_domain === "string" ? o.input_domain : null,
    trendtrack_lookup:
      o.trendtrack_lookup && typeof o.trendtrack_lookup === "object"
        ? (o.trendtrack_lookup as BrandCompetitorAnalysisRow["trendtrack_lookup"])
        : null,
    trendtrack_ads: ads as BrandCompetitorAnalysisRow["trendtrack_ads"],
    website_text_sample: typeof o.website_text_sample === "string" ? o.website_text_sample : "",
    claude: {
      summary: typeof claudeRaw.summary === "string" ? claudeRaw.summary : "",
      positioning_vs_you:
        typeof claudeRaw.positioning_vs_you === "string" ? claudeRaw.positioning_vs_you : undefined,
      ad_patterns: Array.isArray(claudeRaw.ad_patterns)
        ? claudeRaw.ad_patterns.filter((x): x is string => typeof x === "string")
        : [],
      angles_they_stress: Array.isArray(claudeRaw.angles_they_stress)
        ? claudeRaw.angles_they_stress.filter((x): x is string => typeof x === "string")
        : [],
      gaps_you_can_attack: Array.isArray(claudeRaw.gaps_you_can_attack)
        ? claudeRaw.gaps_you_can_attack.filter((x): x is string => typeof x === "string")
        : [],
    },
  };
}

export function buildBrandProjectInsights(opts: {
  marketingAngles: BrandMarketingAngle[];
  competitors: unknown[];
  aiMarketAngles?: AngleScore[] | null;
}): BrandProjectInsights {
  const { marketingAngles, competitors: rawCompetitors, aiMarketAngles } = opts;

  const parsed = rawCompetitors
    .map(parseCompetitorRow)
    .filter((c): c is BrandCompetitorAnalysisRow => c !== null);

  const angleLabels = [
    ...marketingAngles.map((a) => a.label),
    ...parsed.flatMap((c) => c.claude.angles_they_stress),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  const allAds: Array<AdLike & { competitorName: string }> = [];
  for (const c of parsed) {
    for (const ad of c.trendtrack_ads) {
      allAds.push({ ...ad, competitorName: c.input_name });
    }
  }

  const topHooks: HookRow[] = allAds
    .map((ad) => ({
      hook: extractHook(ad),
      script: extractScript(ad),
      platform: (ad.platform ?? "meta").toString(),
      reach: Number(ad.reach) > 0 ? Number(ad.reach) : 0,
      competitorName: ad.competitorName,
    }))
    .filter((h) => h.hook.length > 0)
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 24);

  const heuristicChart = scoreAdsByAngles(allAds, angleLabels);
  const marketAngleChart =
    aiMarketAngles && aiMarketAngles.length > 0 ? aiMarketAngles : heuristicChart;

  for (const h of topHooks) {
    let best = "";
    let bestScore = 0;
    for (const a of marketAngleChart) {
      const s = angleMatchScore(a.label, h.hook, h.script);
      if (s > bestScore) {
        bestScore = s;
        best = a.label;
      }
    }
    if (best) h.matchedAngle = best;
  }

  const competitors: CompetitorInsight[] = parsed.map((c) => {
    const compAds = c.trendtrack_ads.map((ad) => ({
      hook: extractHook(ad),
      script: extractScript(ad),
      platform: (ad.platform ?? "meta").toString(),
      reach: Number(ad.reach) > 0 ? Number(ad.reach) : 0,
      videoUrl: ad.videoUrl ?? undefined,
    }));

    const compAngleLabels = [
      ...c.claude.angles_they_stress,
      ...angleLabels.slice(0, 8),
    ].filter((v, i, arr) => v && arr.indexOf(v) === i);

    return {
      name: c.input_name,
      domain: c.input_domain ?? c.trendtrack_lookup?.domain ?? null,
      summary: c.claude.summary,
      anglesTheyStress: c.claude.angles_they_stress,
      topAds: compAds.sort((a, b) => b.reach - a.reach).slice(0, 8),
      angleChart: scoreAdsByAngles(
        c.trendtrack_ads.map((ad) => ({ ...ad, competitorName: c.input_name })),
        compAngleLabels.length > 0 ? compAngleLabels : angleLabels,
      ),
      activeAds: c.trendtrack_lookup?.activeAds,
    };
  });

  return {
    winningAngles: marketingAngles,
    marketAngleChart,
    topHooks,
    competitors,
    totals: {
      competitorCount: parsed.length,
      adSamples: allAds.length,
      adsWithReach: allAds.filter((a) => Number(a.reach) > 0).length,
    },
  };
}

export function normalizeAiAngles(raw: unknown): AngleScore[] {
  if (!Array.isArray(raw)) return [];
  const out: AngleScore[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const pct = typeof o.pct === "number" && Number.isFinite(o.pct) ? Math.round(o.pct) : 0;
    if (!label) continue;
    out.push({
      label,
      pct,
      adCount: typeof o.adCount === "number" ? o.adCount : 0,
      totalReach: typeof o.totalReach === "number" ? o.totalReach : 0,
    });
  }
  return out;
}
