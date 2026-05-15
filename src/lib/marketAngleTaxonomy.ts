/** Canonical competitor angle taxonomy (Claude classification labels). */
export const MARKET_ANGLE_TAXONOMY = [
  { id: "gut-friendly", label: "Gut-friendly coffee alternative", color: "#34d399" },
  { id: "no-crash-energy", label: "No crash / no anxiety energy", color: "#a78bfa" },
  { id: "mushroom-dosage", label: "7 mushrooms / dosage claim", color: "#60a5fa" },
  { id: "coffee-switch", label: "The better coffee switch", color: "#fb923c" },
  { id: "made-in-france", label: "Made & packed in France", color: "#f87171" },
  { id: "social-good", label: "Social good / ESAT story", color: "#f472b6" },
  { id: "60-day-guarantee", label: "60-day risk-free trial", color: "#4ade80" },
  { id: "science-backed", label: "Science-backed adaptogens", color: "#94a3b8" },
  { id: "taste-first", label: "Taste-first pleasure", color: "#fbbf24" },
  { id: "subscription", label: "Subscription / bundle", color: "#c084fc" },
  { id: "community-proof", label: "Community proof", color: "#2dd4bf" },
  { id: "afternoon-choco", label: "Afternoon chocolate ritual", color: "#78716c" },
] as const;

export type MarketAngleId = (typeof MARKET_ANGLE_TAXONOMY)[number]["id"];

export const MARKET_ANGLE_IDS: MarketAngleId[] = MARKET_ANGLE_TAXONOMY.map((a) => a.id);

export function angleLabel(angleId: string): string {
  return MARKET_ANGLE_TAXONOMY.find((a) => a.id === angleId)?.label ?? angleId;
}

export function angleColor(angleId: string): string {
  return MARKET_ANGLE_TAXONOMY.find((a) => a.id === angleId)?.color ?? "#94a3b8";
}

export function slugifyAngleLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Map a user marketing angle label to the closest taxonomy id (heuristic). */
export function matchUserAngleToTaxonomy(userLabel: string): MarketAngleId | null {
  const slug = slugifyAngleLabel(userLabel);
  if (MARKET_ANGLE_IDS.includes(slug as MarketAngleId)) return slug as MarketAngleId;

  const lower = userLabel.toLowerCase();
  for (const t of MARKET_ANGLE_TAXONOMY) {
    const words = t.label.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.some((w) => lower.includes(w))) return t.id;
  }
  return null;
}
