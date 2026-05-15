import { createHash } from "crypto";

import { claudeMessagesText } from "@/lib/claudeResponses";
import { getCached, setCached } from "@/lib/trendtrackCache";
import { MARKET_ANGLE_IDS } from "@/lib/marketAngleTaxonomy";
import type { ClassifiedCompetitorAd, MixCompetitorAd } from "@/lib/marketAngleMix";

const TTL_SECONDS = 7 * 24 * 60 * 60;

export type CachedClassificationPayload = {
  ads: ClassifiedCompetitorAd[];
  classifiedAt: string;
  adsFingerprint: string;
};

function cacheKey(projectId: string, domain: string): string {
  const h = createHash("sha256").update(domain.toLowerCase()).digest("hex").slice(0, 16);
  return `brand-mix:classified:v1:${projectId}:${h}`;
}

function fingerprint(ads: MixCompetitorAd[]): string {
  return createHash("sha256")
    .update(ads.map((a) => `${a.id}:${a.reach}`).join("|"))
    .digest("hex")
    .slice(0, 20);
}

function parseClassification(raw: string, ads: MixCompetitorAd[]): ClassifiedCompetitorAd[] {
  let parsed: Array<{ id?: string; angle?: string; confidence?: number }> = [];
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) parsed = JSON.parse(match[0]) as typeof parsed;
  }

  const byId = new Map(parsed.map((r) => [String(r.id ?? ""), r]));
  return ads.map((ad) => {
    const row = byId.get(ad.id);
    const angle =
      typeof row?.angle === "string" && MARKET_ANGLE_IDS.includes(row.angle as (typeof MARKET_ANGLE_IDS)[number])
        ? row.angle
        : "science-backed";
    const confidence =
      typeof row?.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.min(1, Math.max(0, row.confidence))
        : 0.5;
    return { ...ad, angle, confidence };
  });
}

export async function classifyCompetitorAds(opts: {
  projectId: string;
  domain: string;
  ads: MixCompetitorAd[];
  force?: boolean;
}): Promise<{ ads: ClassifiedCompetitorAd[]; fromCache: boolean }> {
  const fp = fingerprint(opts.ads);
  const key = cacheKey(opts.projectId, opts.domain);

  if (!opts.force) {
    const cached = await getCached<CachedClassificationPayload>(key);
    if (cached?.ads?.length && cached.adsFingerprint === fp) {
      return { ads: cached.ads, fromCache: true };
    }
  }

  if (opts.ads.length === 0) {
    return { ads: [], fromCache: false };
  }

  const raw = await claudeMessagesText({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 1200,
    user: `Classify each ad into exactly one angle id.

Angles: ${MARKET_ANGLE_IDS.join(", ")}

Ads:
${JSON.stringify(opts.ads.map((a) => ({ id: a.id, copy: a.copy.slice(0, 280) })))}

Return ONLY JSON array:
[{"id":"...","angle":"gut-friendly","confidence":0.85}]`,
  });

  const classified = parseClassification(raw, opts.ads);
  const payload: CachedClassificationPayload = {
    ads: classified,
    classifiedAt: new Date().toISOString(),
    adsFingerprint: fp,
  };
  await setCached(key, payload, TTL_SECONDS);
  return { ads: classified, fromCache: false };
}
