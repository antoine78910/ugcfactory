import { randomUUID } from "crypto";

import { claudeMessagesText, type ClaudeModel } from "@/lib/claudeResponses";
import type { OnboardingCrawledPage } from "@/lib/onboardingSiteCrawler";
import { parseJsonObject } from "@/lib/onboardingJson";
import type { TTAd, TTLookupResult } from "@/lib/trendtrack";

export const ONBOARDING_BRAND_MODEL: ClaudeModel = "claude-sonnet-4-6";

export type BrandMarketingAngle = {
  id: string;
  label: string;
  rationale?: string;
  evidence?: string;
};

export type BrandSiteAnalysis = {
  brand_summary: string;
  problems_solved: string[];
  marketing_angles: Array<{ label: string; rationale?: string; evidence?: string }>;
  positioning: string;
  icp_summary: string;
  key_messaging_pillars: string[];
  site_structure_notes: string;
  risks_or_gaps: string[];
};

export type BrandCompetitorAnalysisRow = {
  input_name: string;
  input_domain?: string | null;
  trendtrack_lookup?: TTLookupResult | null;
  trendtrack_ads: Array<Pick<TTAd, "headline" | "title" | "body" | "text" | "platform" | "reach" | "videoUrl">>;
  website_text_sample?: string;
  claude: {
    summary: string;
    positioning_vs_you?: string;
    ad_patterns: string[];
    angles_they_stress: string[];
    gaps_you_can_attack?: string[];
  };
};

function withAngleIds(angles: Omit<BrandMarketingAngle, "id">[]): BrandMarketingAngle[] {
  return angles.map((a) => ({
    id: randomUUID(),
    label: typeof a.label === "string" ? a.label : "Angle",
    rationale: typeof a.rationale === "string" ? a.rationale : undefined,
    evidence: typeof a.evidence === "string" ? a.evidence : undefined,
  }));
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 24);
}

function asAngleInputs(v: unknown): Omit<BrandMarketingAngle, "id">[] {
  if (!Array.isArray(v)) return [];
  const out: Omit<BrandMarketingAngle, "id">[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) continue;
    const rationale = typeof o.rationale === "string" ? o.rationale.trim() : undefined;
    const evidence = typeof o.evidence === "string" ? o.evidence.trim() : undefined;
    out.push({ label, rationale, evidence });
    if (out.length >= 16) break;
  }
  return out;
}

export function normalizeBrandSiteAnalysis(raw: Record<string, unknown>): {
  analysis: BrandSiteAnalysis;
  marketingAngles: BrandMarketingAngle[];
} {
  const marketing_angle_inputs = asAngleInputs(raw.marketing_angles);
  const analysis: BrandSiteAnalysis = {
    brand_summary: typeof raw.brand_summary === "string" ? raw.brand_summary.trim() : "No brand summary returned.",
    problems_solved: asStringArray(raw.problems_solved),
    marketing_angles: marketing_angle_inputs,
    positioning: typeof raw.positioning === "string" ? raw.positioning.trim() : "",
    icp_summary: typeof raw.icp_summary === "string" ? raw.icp_summary.trim() : "",
    key_messaging_pillars: asStringArray(raw.key_messaging_pillars),
    site_structure_notes:
      typeof raw.site_structure_notes === "string" ? raw.site_structure_notes.trim() : "",
    risks_or_gaps: asStringArray(raw.risks_or_gaps),
  };
  return {
    analysis,
    marketingAngles: withAngleIds(marketing_angle_inputs),
  };
}

export async function claudeAnalyzeBrandSite(opts: {
  siteUrl: string;
  siteName?: string | null;
  pages: OnboardingCrawledPage[];
}): Promise<{ analysis: BrandSiteAnalysis; marketingAngles: BrandMarketingAngle[] }> {
  const { siteUrl, siteName, pages } = opts;
  const system = [
    "You are a senior performance marketer and strategist.",
    "Read the provided website text samples (multi-page shallow crawl).",
    "Return strict JSON only (English). Ground claims in the samples; mark uncertainty briefly when needed.",
    "Do not invent compliance guarantees or revenue numbers.",
  ].join(" ");

  const user = [
    `Primary site URL: ${siteUrl}`,
    siteName?.trim() ? `Known brand / site name hint: ${siteName.trim()}` : "",
    "Crawled pages (title + text sample per URL):",
    JSON.stringify(
      pages.map((p) => ({ url: p.url, title: p.title ?? null, textSample: p.textSample })),
      null,
      2,
    ),
    "",
    "Return JSON with keys:",
    "- brand_summary (string)",
    "- problems_solved (string[])",
    "- marketing_angles: [{ label, rationale, evidence }] max 12",
    "- positioning (string)",
    "- icp_summary (string)",
    "- key_messaging_pillars (string[])",
    "- site_structure_notes (string)",
    "- risks_or_gaps (string[])",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await claudeMessagesText({
    system,
    user,
    model: ONBOARDING_BRAND_MODEL,
    maxTokens: 6000,
  });
  const parsed = parseJsonObject(text);
  return normalizeBrandSiteAnalysis(parsed);
}

export async function claudeAnalyzeCompetitorsPack(opts: {
  yourSiteUrl: string;
  yourSummary: string;
  rows: BrandCompetitorAnalysisRow[];
}): Promise<{ competitors: BrandCompetitorAnalysisRow[] }> {
  const payload = opts.rows.map((r) => ({
    input_name: r.input_name,
    input_domain: r.input_domain ?? null,
    trendtrack: r.trendtrack_lookup
      ? {
          id: r.trendtrack_lookup.id,
          name: r.trendtrack_lookup.name,
          domain: r.trendtrack_lookup.domain ?? null,
        }
      : null,
    ads: r.trendtrack_ads.slice(0, 14),
    website_text_sample: (r.website_text_sample ?? "").slice(0, 8000),
  }));

  const system = [
    "You compare competitor brands to a user's brand for paid social strategy.",
    "Use TrendTrack ad samples plus any website text provided.",
    "Return strict JSON only (English).",
    "For each competitor in the same order as `competitors`, output a `claude` object.",
  ].join(" ");

  const user = [
    `User brand site: ${opts.yourSiteUrl}`,
    `User brand one-line summary: ${opts.yourSummary}`,
    "",
    "Competitors payload:",
    JSON.stringify({ competitors: payload }, null, 2),
    "",
    "Return JSON: { \"competitors\": [ { \"claude\": {",
    "  \"summary\": string,",
    "  \"positioning_vs_you\": string,",
    "  \"ad_patterns\": string[],",
    "  \"angles_they_stress\": string[],",
    "  \"gaps_you_can_attack\": string[]",
    "} } ] }",
    "The array length must match the input competitors array length.",
  ].join("\n");

  const text = await claudeMessagesText({
    system,
    user,
    model: ONBOARDING_BRAND_MODEL,
    maxTokens: 7000,
  });
  const parsed = parseJsonObject(text);
  const arr = Array.isArray(parsed.competitors) ? parsed.competitors : [];
  const merged: BrandCompetitorAnalysisRow[] = opts.rows.map((row, idx) => {
    const slot = arr[idx];
    const c =
      slot && typeof slot === "object" && "claude" in (slot as object)
        ? ((slot as { claude?: unknown }).claude as Record<string, unknown> | undefined)
        : undefined;
    const summary = typeof c?.summary === "string" ? c.summary.trim() : "No summary returned.";
    const positioning_vs_you =
      typeof c?.positioning_vs_you === "string" ? c.positioning_vs_you.trim() : "";
    const ad_patterns = asStringArray(c?.ad_patterns);
    const angles_they_stress = asStringArray(c?.angles_they_stress);
    const gaps_you_can_attack = asStringArray(c?.gaps_you_can_attack);
    return {
      ...row,
      claude: {
        summary,
        positioning_vs_you: positioning_vs_you || undefined,
        ad_patterns,
        angles_they_stress,
        gaps_you_can_attack,
      },
    };
  });
  return { competitors: merged };
}
