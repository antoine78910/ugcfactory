import {
  angleColor,
  angleLabel,
  MARKET_ANGLE_IDS,
  MARKET_ANGLE_TAXONOMY,
  matchUserAngleToTaxonomy,
  slugifyAngleLabel,
  type MarketAngleId,
} from "@/lib/marketAngleTaxonomy";

export type MixCompetitorAd = {
  id: string;
  copy: string;
  headline: string;
  body: string;
  reach: number;
  platform: string;
  format: "video" | "image" | "unknown";
  daysRunning?: number;
  videoUrl?: string;
  imageUrl?: string;
};

export type ClassifiedCompetitorAd = MixCompetitorAd & {
  angle: string;
  confidence: number;
};

export type AngleMixRow = {
  angle: string;
  label: string;
  color: string;
  adCount: number;
  totalReach: number;
  reachShare: number;
  isGap: boolean;
  isOwned: boolean;
  topAd?: ClassifiedCompetitorAd;
};

export type AngleMixInsights = {
  whatToTest: string[];
  formatMix: { videos: number; images: number; summary: string };
};

export type AngleMixResult = {
  mix: AngleMixRow[];
  topAds: ClassifiedCompetitorAd[];
  totalReach: number;
  insights: AngleMixInsights;
};

function userOwnsAngle(angleId: string, yourLabels: string[]): boolean {
  const slug = slugifyAngleLabel(angleId);
  for (const label of yourLabels) {
    const mapped = matchUserAngleToTaxonomy(label);
    if (mapped === angleId) return true;
    if (slugifyAngleLabel(label) === slug) return true;
    if (label.toLowerCase().includes(angleLabel(angleId).toLowerCase().slice(0, 12))) return true;
  }
  return false;
}

export function computeAngleMix(
  classifiedAds: ClassifiedCompetitorAd[],
  yourAngleLabels: string[],
): AngleMixResult {
  const yourLabels = yourAngleLabels.map((l) => l.trim()).filter(Boolean);
  const allReach = classifiedAds.reduce((s, a) => s + (a.reach > 0 ? a.reach : 0), 0) || 1;

  const byAngle = new Map<string, ClassifiedCompetitorAd[]>();
  for (const ad of classifiedAds) {
    const key = ad.angle || "science-backed";
    const list = byAngle.get(key) ?? [];
    list.push(ad);
    byAngle.set(key, list);
  }

  const angleIds = new Set<string>([...MARKET_ANGLE_IDS]);
  for (const label of yourLabels) {
    const mapped = matchUserAngleToTaxonomy(label);
    if (mapped) angleIds.add(mapped);
    else angleIds.add(slugifyAngleLabel(label));
  }

  const mix: AngleMixRow[] = [...angleIds].map((angle) => {
    const ads = byAngle.get(angle) ?? [];
    const totalReach = ads.reduce((s, a) => s + (a.reach > 0 ? a.reach : 0), 0);
    const reachShare = ads.length === 0 ? 0 : Math.round((totalReach / allReach) * 100);
    const topAd = [...ads].sort((a, b) => b.reach - a.reach)[0];
    const isOwned = reachShare === 0 && userOwnsAngle(angle, yourLabels);
    const isGap = reachShare >= 10 && !userOwnsAngle(angle, yourLabels);

    return {
      angle,
      label: MARKET_ANGLE_TAXONOMY.find((t) => t.id === angle)?.label ?? angle,
      color: angleColor(angle),
      adCount: ads.length,
      totalReach,
      reachShare,
      isGap,
      isOwned,
      topAd,
    };
  });

  mix.sort((a, b) => b.reachShare - a.reachShare);

  const topAds = [...classifiedAds].sort((a, b) => b.reach - a.reach).slice(0, 5);
  const videos = classifiedAds.filter((a) => a.format === "video").length;
  const images = classifiedAds.filter((a) => a.format === "image").length;

  const whatToTest: string[] = [];
  const topGap = mix.find((r) => r.isGap);
  if (topGap) {
    whatToTest.push(
      `${topGap.label} = competitor's #${mix.indexOf(topGap) + 1} angle. You're not running it — test immediately.`,
    );
  }
  const owned = mix.filter((r) => r.isOwned);
  if (owned.length > 0) {
    whatToTest.push(
      `${owned.map((o) => o.label).slice(0, 2).join(" + ")} — your differentiators with no competitor reach.`,
    );
  }
  if (whatToTest.length === 0 && mix[0]?.reachShare) {
    whatToTest.push(`Lead with "${mix[0].label}" — highest share of competitor reach (${mix[0].reachShare}%).`);
  }

  return {
    mix,
    topAds,
    totalReach: allReach,
    insights: {
      whatToTest,
      formatMix: {
        videos,
        images,
        summary:
          videos + images === 0
            ? "No format data yet."
            : `${videos} video${videos !== 1 ? "s" : ""} / ${images} image${images !== 1 ? "s" : ""}. ${
                videos >= images ? "Video dominates in this snapshot." : "Static images lead in this snapshot."
              }`,
      },
    },
  };
}
