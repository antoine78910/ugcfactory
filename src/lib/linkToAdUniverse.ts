/** Persisted Link to Ad Universe state (stored inside ugc_runs.extracted.__universe) */
export type LinkToAdUniverseSnapshotV1 = {
  v: 1;
  phase: "after_summary" | "after_scripts";
  cleanCandidate: { url: string; reason?: string } | null;
  fallbackImageUrl: string | null;
  confidence: string | null;
  neutralUploadUrl: string | null;
  /** Packshot URLs from images-classify (product-only), best first — used to rebuild multi-angle GPT context. */
  productOnlyImageUrls?: string[] | null;
  summaryText: string;
  scriptsText: string;
  angleLabels: [string, string, string];
  selectedAngleIndex: number | null;
  /** GPT output: 3 NanoBanana reference prompts (PROMPT 1/2/3) */
  nanoBananaPromptsRaw?: string;
  /** Which of the 3 prompts is used for NanoBanana Pro */
  nanoBananaSelectedPromptIndex?: 0 | 1 | 2 | null;
  nanoBananaTaskId?: string | null;
  nanoBananaImageUrl?: string | null;
  /** NanoBanana Pro generated images for PROMPT 1/2/3 (index-aligned). */
  nanoBananaImageUrls?: string[] | null;
  /** Which of the 3 generated NanoBanana images is selected. */
  nanoBananaSelectedImageIndex?: 0 | 1 | 2 | null;
  /** GPT image-to-video prompt for Kling / Veo */
  ugcVideoPromptGpt?: string;
  klingTaskId?: string | null;
  klingVideoUrl?: string | null;
};

const FALLBACK_ANGLE_LABELS: [string, string, string] = [
  "Pain & urgency — stop the scroll with a relatable frustration.",
  "Trust & proof — calm objections and show why it works.",
  "Desire & transformation — lead with the main product benefit.",
];

/** Split GPT output into the 3 SCRIPT OPTION bodies (best-effort). */
export function splitScriptOptions(full: string): [string, string, string] {
  const text = full.replace(/\r\n/g, "\n");
  const markers = [
    text.search(/SCRIPT\s+OPTION\s*1\b/i),
    text.search(/SCRIPT\s+OPTION\s*2\b/i),
    text.search(/SCRIPT\s+OPTION\s*3\b/i),
  ];
  if (markers[0] === -1) {
    const third = Math.max(1, Math.floor(text.length / 3));
    return [text.slice(0, third), text.slice(third, third * 2), text.slice(third * 2)];
  }
  const ends = [...markers.slice(1), text.length];
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const start = markers[i];
    const end = i < 2 ? Math.max(start, markers[i + 1]) : text.length;
    out.push(start >= 0 ? text.slice(start, end).trim() : "");
  }
  return [out[0] || text, out[1] || "", out[2] || ""];
}

/** Strip a leading `SCRIPT OPTION n` line so we can re-wrap with {@link joinScriptOptions}. */
function stripScriptOptionHeader(n: 1 | 2 | 3, block: string): string {
  const t = block.trim();
  const re = new RegExp(`^SCRIPT\\s+OPTION\\s*${n}\\b\\s*\\n+`, "i");
  return t.replace(re, "").trim();
}

/** Rebuild full scripts text from three edited blocks (matches common GPT layout). */
export function joinScriptOptions(parts: [string, string, string]): string {
  const b0 = stripScriptOptionHeader(1, parts[0]);
  const b1 = stripScriptOptionHeader(2, parts[1]);
  const b2 = stripScriptOptionHeader(3, parts[2]);
  return `SCRIPT OPTION 1\n\n${b0}\n\nSCRIPT OPTION 2\n\n${b1}\n\nSCRIPT OPTION 3\n\n${b2}`;
}

export function selectedAngleScript(scriptsText: string, selectedAngleIndex: number | null): string {
  if (selectedAngleIndex == null || selectedAngleIndex < 0 || selectedAngleIndex > 2) return "";
  const [a, b, c] = splitScriptOptions(scriptsText);
  return [a, b, c][selectedAngleIndex] ?? "";
}

/** One-line-ish teaser from a script block: first spoken line after HOOK, else first quoted line. */
export function teaserFromScriptBlock(block: string, index: 0 | 1 | 2): string {
  const hookSpoken = block.match(/HOOK\s*[\s\S]*?\([^)]*\)\s*\n\s*"([^"]+)"/i);
  if (hookSpoken?.[1]) {
    const s = hookSpoken[1].trim();
    return s.length > 140 ? `${s.slice(0, 137)}…` : s;
  }
  const any = block.match(/"([^"]{10,200})"/);
  if (any?.[1]) {
    const s = any[1].trim();
    return s.length > 140 ? `${s.slice(0, 137)}…` : s;
  }
  return FALLBACK_ANGLE_LABELS[index];
}

export function deriveAngleLabelsFromScripts(scriptsText: string): [string, string, string] {
  const [a, b, c] = splitScriptOptions(scriptsText);
  return [
    teaserFromScriptBlock(a, 0),
    teaserFromScriptBlock(b, 1),
    teaserFromScriptBlock(c, 2),
  ];
}

/**
 * Parse PROMPT 1 / PROMPT 2 / PROMPT 3 blocks from GPT output.
 */
export function parseThreeLabeledPrompts(text: string): [string, string, string] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return ["", "", ""];

  const headerRe = /^\s*PROMPT\s*([123])\s*$/gim;
  const markers: { num: 1 | 2 | 3; bodyStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(t)) !== null) {
    const n = Number(m[1]);
    if (n !== 1 && n !== 2 && n !== 3) continue;
    const lineEnd = t.indexOf("\n", m.index);
    const bodyStart = lineEnd === -1 ? t.length : lineEnd + 1;
    markers.push({ num: n as 1 | 2 | 3, bodyStart });
  }

  if (markers.length === 0) {
    const third = Math.max(1, Math.floor(t.length / 3));
    return [t.slice(0, third).trim(), t.slice(third, 2 * third).trim(), t.slice(2 * third).trim()];
  }

  const byNum: Record<1 | 2 | 3, string> = { 1: "", 2: "", 3: "" };
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].bodyStart;
    const end =
      i + 1 < markers.length
        ? (() => {
            const sub = t.slice(start);
            const j = sub.search(/\n\s*PROMPT\s*[123]\s*\n/i);
            return j === -1 ? t.length : start + j;
          })()
        : t.length;
    byNum[markers[i].num] = t.slice(start, end).trim();
  }
  return [byNum[1], byNum[2], byNum[3]];
}

/** Clears Nano → Kling pipeline fields (keeps summary, scripts, angles text, product refs). */
export const UNIVERSE_PIPELINE_CLEAR: Partial<LinkToAdUniverseSnapshotV1> = {
  nanoBananaPromptsRaw: undefined,
  nanoBananaSelectedPromptIndex: 0,
  nanoBananaTaskId: null,
  nanoBananaImageUrl: null,
  nanoBananaImageUrls: undefined,
  nanoBananaSelectedImageIndex: null,
  ugcVideoPromptGpt: undefined,
  klingTaskId: null,
  klingVideoUrl: null,
};

export function readUniverseFromExtracted(extracted: unknown): LinkToAdUniverseSnapshotV1 | null {
  if (!extracted || typeof extracted !== "object") return null;
  const u = (extracted as Record<string, unknown>).__universe;
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  if (o.v !== 1) return null;
  const clean = o.cleanCandidate;
  return {
    v: 1,
    phase: o.phase === "after_scripts" ? "after_scripts" : "after_summary",
    cleanCandidate:
      clean && typeof clean === "object" && typeof (clean as { url?: string }).url === "string"
        ? {
            url: String((clean as { url: string }).url),
            reason: typeof (clean as { reason?: string }).reason === "string" ? (clean as { reason: string }).reason : undefined,
          }
        : null,
    fallbackImageUrl: typeof o.fallbackImageUrl === "string" ? o.fallbackImageUrl : null,
    confidence: typeof o.confidence === "string" ? o.confidence : o.confidence != null ? String(o.confidence) : null,
    neutralUploadUrl: typeof o.neutralUploadUrl === "string" ? o.neutralUploadUrl : null,
    productOnlyImageUrls:
      Array.isArray(o.productOnlyImageUrls) && o.productOnlyImageUrls.every((x) => typeof x === "string")
        ? (o.productOnlyImageUrls as string[])
        : null,
    summaryText: typeof o.summaryText === "string" ? o.summaryText : "",
    scriptsText: typeof o.scriptsText === "string" ? o.scriptsText : "",
    angleLabels:
      Array.isArray(o.angleLabels) && o.angleLabels.length >= 3
        ? [String(o.angleLabels[0]), String(o.angleLabels[1]), String(o.angleLabels[2])]
        : ["", "", ""],
    selectedAngleIndex: typeof o.selectedAngleIndex === "number" && o.selectedAngleIndex >= 0 && o.selectedAngleIndex <= 2 ? o.selectedAngleIndex : null,
    nanoBananaPromptsRaw: typeof o.nanoBananaPromptsRaw === "string" ? o.nanoBananaPromptsRaw : undefined,
    nanoBananaSelectedPromptIndex:
      typeof o.nanoBananaSelectedPromptIndex === "number" && o.nanoBananaSelectedPromptIndex >= 0 && o.nanoBananaSelectedPromptIndex <= 2
        ? (o.nanoBananaSelectedPromptIndex as 0 | 1 | 2)
        : undefined,
    nanoBananaTaskId: typeof o.nanoBananaTaskId === "string" ? o.nanoBananaTaskId : o.nanoBananaTaskId === null ? null : undefined,
    nanoBananaImageUrl: typeof o.nanoBananaImageUrl === "string" ? o.nanoBananaImageUrl : o.nanoBananaImageUrl === null ? null : undefined,
    nanoBananaImageUrls:
      Array.isArray(o.nanoBananaImageUrls) && o.nanoBananaImageUrls.every((x) => typeof x === "string")
        ? (o.nanoBananaImageUrls as string[])
        : o.nanoBananaImageUrls === null
          ? null
          : undefined,
    nanoBananaSelectedImageIndex:
      typeof o.nanoBananaSelectedImageIndex === "number" && o.nanoBananaSelectedImageIndex >= 0 && o.nanoBananaSelectedImageIndex <= 2
        ? (o.nanoBananaSelectedImageIndex as 0 | 1 | 2)
        : undefined,
    ugcVideoPromptGpt: typeof o.ugcVideoPromptGpt === "string" ? o.ugcVideoPromptGpt : undefined,
    klingTaskId: typeof o.klingTaskId === "string" ? o.klingTaskId : o.klingTaskId === null ? null : undefined,
    klingVideoUrl: typeof o.klingVideoUrl === "string" ? o.klingVideoUrl : o.klingVideoUrl === null ? null : undefined,
  };
}

export function cloneExtractedBase(extracted: unknown): Record<string, unknown> {
  try {
    const o = extracted && typeof extracted === "object" ? (extracted as Record<string, unknown>) : {};
    const { __universe: _, ...rest } = o;
    return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** New ad on same store: keep brief + scripts, reset angle choice and image/video pipeline. */
export function branchUniverseForNewAd(snap: LinkToAdUniverseSnapshotV1): LinkToAdUniverseSnapshotV1 {
  return {
    ...snap,
    phase: "after_scripts",
    selectedAngleIndex: null,
    ...UNIVERSE_PIPELINE_CLEAR,
  };
}
