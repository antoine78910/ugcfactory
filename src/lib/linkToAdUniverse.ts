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
  /**
   * Per reference image (0–2): latest video, optional in-flight task, older URLs (newest first).
   * Top-level `klingTaskId` / `klingVideoUrl` mirror the currently selected reference for legacy readers.
   */
  klingByReferenceIndex?: KlingReferenceSlotV1[] | null;
  /**
   * Full Nano → Kling pipeline per script angle (0–2). Lets users switch angles without losing work.
   * Top-level nano/kling fields mirror the selected angle for legacy readers.
   */
  linkToAdPipelineByAngle?: [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1] | null;
};

/** Saved pipeline for one script angle (3 reference images + Kling state for that angle). */
export type LinkToAdAnglePipelineV1 = {
  nanoBananaPromptsRaw?: string;
  nanoBananaSelectedPromptIndex?: 0 | 1 | 2;
  nanoBananaTaskId?: string | null;
  nanoBananaImageUrl?: string | null;
  nanoBananaImageUrls?: string[];
  nanoBananaSelectedImageIndex?: 0 | 1 | 2 | null;
  ugcVideoPromptGpt?: string;
  klingByReferenceIndex?: KlingReferenceSlotV1[] | null;
  videoStageMode?: boolean;
};

/** One NanoBanana reference frame’s video state (index-aligned with nanoBananaImageUrls). */
export type KlingReferenceSlotV1 = {
  videoUrl?: string | null;
  taskId?: string | null;
  history?: string[];
  /** Motion prompt used / last saved for this frame */
  ugcVideoPrompt?: string;
};

const EMPTY_KLING_SLOT: KlingReferenceSlotV1 = {
  videoUrl: null,
  taskId: null,
  history: [],
};

/** Three empty slots (new array + history copies). */
export function createEmptyKlingByReference(): KlingReferenceSlotV1[] {
  return [
    { ...EMPTY_KLING_SLOT, history: [] },
    { ...EMPTY_KLING_SLOT, history: [] },
    { ...EMPTY_KLING_SLOT, history: [] },
  ];
}

function cloneSlot(s: KlingReferenceSlotV1): KlingReferenceSlotV1 {
  return {
    videoUrl: s.videoUrl ?? null,
    taskId: s.taskId ?? null,
    history: Array.isArray(s.history) ? [...s.history] : [],
    ugcVideoPrompt: typeof s.ugcVideoPrompt === "string" ? s.ugcVideoPrompt : undefined,
  };
}

export const cloneKlingReferenceSlot = cloneSlot;

function parseKlingSlotsFromUnknown(raw: unknown): KlingReferenceSlotV1[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: KlingReferenceSlotV1[] = [];
  for (let i = 0; i < 3 && i < raw.length; i++) {
    const s = raw[i];
    if (!s || typeof s !== "object") return null;
    const o = s as Record<string, unknown>;
    out.push({
      videoUrl: typeof o.videoUrl === "string" ? o.videoUrl : o.videoUrl === null ? null : null,
      taskId: typeof o.taskId === "string" ? o.taskId : o.taskId === null ? null : null,
      history:
        Array.isArray(o.history) && o.history.every((x) => typeof x === "string") ? [...(o.history as string[])] : [],
      ugcVideoPrompt: typeof o.ugcVideoPrompt === "string" ? o.ugcVideoPrompt : undefined,
    });
  }
  return out.length === 3 ? out : null;
}

export function emptyAnglePipeline(): LinkToAdAnglePipelineV1 {
  return {
    nanoBananaPromptsRaw: "",
    nanoBananaSelectedPromptIndex: 0,
    nanoBananaTaskId: null,
    nanoBananaImageUrl: null,
    nanoBananaImageUrls: [],
    nanoBananaSelectedImageIndex: null,
    ugcVideoPromptGpt: "",
    klingByReferenceIndex: createEmptyKlingByReference(),
    videoStageMode: false,
  };
}

export function cloneAnglePipeline(p: LinkToAdAnglePipelineV1): LinkToAdAnglePipelineV1 {
  const k = p.klingByReferenceIndex;
  return {
    ...p,
    nanoBananaImageUrls: Array.isArray(p.nanoBananaImageUrls) ? [...p.nanoBananaImageUrls] : [],
    klingByReferenceIndex:
      k && k.length === 3 ? k.map((s) => cloneSlot(s)) : createEmptyKlingByReference(),
  };
}

function parseAnglePipelineNode(x: unknown): LinkToAdAnglePipelineV1 | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const spi =
    typeof o.nanoBananaSelectedPromptIndex === "number" && o.nanoBananaSelectedPromptIndex >= 0 && o.nanoBananaSelectedPromptIndex <= 2
      ? (o.nanoBananaSelectedPromptIndex as 0 | 1 | 2)
      : 0;
  const sii =
    typeof o.nanoBananaSelectedImageIndex === "number" && o.nanoBananaSelectedImageIndex >= 0 && o.nanoBananaSelectedImageIndex <= 2
      ? (o.nanoBananaSelectedImageIndex as 0 | 1 | 2)
      : null;
  const urls =
    Array.isArray(o.nanoBananaImageUrls) && o.nanoBananaImageUrls.every((u) => typeof u === "string")
      ? [...(o.nanoBananaImageUrls as string[])]
      : [];
  const kParsed = parseKlingSlotsFromUnknown(o.klingByReferenceIndex);
  return {
    nanoBananaPromptsRaw: typeof o.nanoBananaPromptsRaw === "string" ? o.nanoBananaPromptsRaw : "",
    nanoBananaSelectedPromptIndex: spi,
    nanoBananaTaskId: typeof o.nanoBananaTaskId === "string" ? o.nanoBananaTaskId : o.nanoBananaTaskId === null ? null : null,
    nanoBananaImageUrl: typeof o.nanoBananaImageUrl === "string" ? o.nanoBananaImageUrl : o.nanoBananaImageUrl === null ? null : null,
    nanoBananaImageUrls: urls,
    nanoBananaSelectedImageIndex: o.nanoBananaSelectedImageIndex === null ? null : sii,
    ugcVideoPromptGpt: typeof o.ugcVideoPromptGpt === "string" ? o.ugcVideoPromptGpt : "",
    klingByReferenceIndex: kParsed ?? createEmptyKlingByReference(),
    videoStageMode: typeof o.videoStageMode === "boolean" ? o.videoStageMode : false,
  };
}

/**
 * Three angle slots: from `linkToAdPipelineByAngle` or migrate legacy flat snapshot into `selectedAngleIndex` only.
 */
export function normalizePipelineByAngle(snap: LinkToAdUniverseSnapshotV1): [
  LinkToAdAnglePipelineV1,
  LinkToAdAnglePipelineV1,
  LinkToAdAnglePipelineV1,
] {
  const raw = snap.linkToAdPipelineByAngle;
  if (Array.isArray(raw) && raw.length >= 3) {
    const a = parseAnglePipelineNode(raw[0]);
    const b = parseAnglePipelineNode(raw[1]);
    const c = parseAnglePipelineNode(raw[2]);
    if (a && b && c) return [cloneAnglePipeline(a), cloneAnglePipeline(b), cloneAnglePipeline(c)];
  }
  const triple: [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1] = [
    emptyAnglePipeline(),
    emptyAnglePipeline(),
    emptyAnglePipeline(),
  ];
  const sel = snap.selectedAngleIndex;
  if (sel !== 0 && sel !== 1 && sel !== 2) return triple;
  const k = snap.klingByReferenceIndex;
  triple[sel] = {
    nanoBananaPromptsRaw: snap.nanoBananaPromptsRaw ?? "",
    nanoBananaSelectedPromptIndex:
      snap.nanoBananaSelectedPromptIndex === 0 || snap.nanoBananaSelectedPromptIndex === 1 || snap.nanoBananaSelectedPromptIndex === 2
        ? snap.nanoBananaSelectedPromptIndex
        : 0,
    nanoBananaTaskId: snap.nanoBananaTaskId ?? null,
    nanoBananaImageUrl: snap.nanoBananaImageUrl ?? null,
    nanoBananaImageUrls: Array.isArray(snap.nanoBananaImageUrls) ? [...snap.nanoBananaImageUrls] : [],
    nanoBananaSelectedImageIndex:
      snap.nanoBananaSelectedImageIndex === 0 || snap.nanoBananaSelectedImageIndex === 1 || snap.nanoBananaSelectedImageIndex === 2
        ? snap.nanoBananaSelectedImageIndex
        : null,
    ugcVideoPromptGpt: snap.ugcVideoPromptGpt ?? "",
    klingByReferenceIndex:
      k && k.length === 3 ? k.map((s) => cloneSlot(s)) : createEmptyKlingByReference(),
    videoStageMode: false,
  };
  return triple;
}

export function flattenAnglePipeToTopLevel(
  pipe: LinkToAdAnglePipelineV1,
  klingNormalized: KlingReferenceSlotV1[],
): Pick<
  LinkToAdUniverseSnapshotV1,
  | "nanoBananaPromptsRaw"
  | "nanoBananaSelectedPromptIndex"
  | "nanoBananaTaskId"
  | "nanoBananaImageUrl"
  | "nanoBananaImageUrls"
  | "nanoBananaSelectedImageIndex"
  | "ugcVideoPromptGpt"
  | "klingByReferenceIndex"
  | "klingVideoUrl"
  | "klingTaskId"
> {
  const idx = pipe.nanoBananaSelectedImageIndex;
  const mirror = idx === 0 || idx === 1 || idx === 2 ? klingNormalized[idx] : klingNormalized[0];
  return {
    nanoBananaPromptsRaw: pipe.nanoBananaPromptsRaw || undefined,
    nanoBananaSelectedPromptIndex: pipe.nanoBananaSelectedPromptIndex ?? 0,
    nanoBananaTaskId: pipe.nanoBananaTaskId ?? null,
    nanoBananaImageUrl: pipe.nanoBananaImageUrl ?? null,
    nanoBananaImageUrls: pipe.nanoBananaImageUrls?.length ? pipe.nanoBananaImageUrls : undefined,
    nanoBananaSelectedImageIndex: pipe.nanoBananaSelectedImageIndex ?? undefined,
    ugcVideoPromptGpt: pipe.ugcVideoPromptGpt || undefined,
    klingByReferenceIndex: klingNormalized,
    klingVideoUrl: mirror?.videoUrl ?? null,
    klingTaskId: mirror?.taskId ?? null,
  };
}

/** First pending Kling task anywhere (multi-angle), for server finalize. */
export function findPendingKlingInUniverse(snap: LinkToAdUniverseSnapshotV1): {
  angleIndex: 0 | 1 | 2;
  refIndex: 0 | 1 | 2;
  taskId: string;
} | null {
  const triple = normalizePipelineByAngle(snap);
  for (let a = 0; a < 3; a++) {
    const slots = triple[a].klingByReferenceIndex;
    if (!Array.isArray(slots) || slots.length < 3) continue;
    for (let r = 0; r < 3; r++) {
      const tid = typeof slots[r]?.taskId === "string" ? slots[r].taskId!.trim() : "";
      const v = typeof slots[r]?.videoUrl === "string" ? slots[r].videoUrl!.trim() : "";
      if (tid && !v) return { angleIndex: a as 0 | 1 | 2, refIndex: r as 0 | 1 | 2, taskId: tid };
    }
  }
  const legacyRef = findPendingKlingSlotIndex(snap);
  if (legacyRef === null || (legacyRef !== 0 && legacyRef !== 1 && legacyRef !== 2)) return null;
  const sel = snap.selectedAngleIndex;
  const ai = sel === 0 || sel === 1 || sel === 2 ? sel : 0;
  const slotsNorm = normalizeKlingByReference(snap);
  const tid = slotsNorm[legacyRef]?.taskId?.trim();
  if (!tid) return null;
  return { angleIndex: ai, refIndex: legacyRef as 0 | 1 | 2, taskId: tid };
}

export function snapshotAfterKlingVideoSuccessForAngle(
  snap: LinkToAdUniverseSnapshotV1,
  angleIndex: 0 | 1 | 2,
  refIndex: 0 | 1 | 2,
  videoUrl: string,
  taskId: string,
): LinkToAdUniverseSnapshotV1 {
  const triple = normalizePipelineByAngle(snap).map((p) => cloneAnglePipeline(p)) as [
    LinkToAdAnglePipelineV1,
    LinkToAdAnglePipelineV1,
    LinkToAdAnglePipelineV1,
  ];
  const pipe = triple[angleIndex];
  let slots =
    pipe.klingByReferenceIndex && pipe.klingByReferenceIndex.length === 3
      ? pipe.klingByReferenceIndex.map((s) => cloneSlot(s))
      : createEmptyKlingByReference();
  const cur = slots[refIndex];
  const prevUrl = typeof cur.videoUrl === "string" ? cur.videoUrl.trim() : "";
  let history = [...(cur.history || [])];
  if (prevUrl && prevUrl !== videoUrl) {
    history = [prevUrl, ...history.filter((u) => u !== prevUrl)];
  }
  slots[refIndex] = {
    ...cur,
    videoUrl,
    taskId,
    history: history.slice(0, 12),
  };
  triple[angleIndex] = { ...pipe, klingByReferenceIndex: slots };

  const sel = snap.selectedAngleIndex;
  const next: LinkToAdUniverseSnapshotV1 = {
    ...snap,
    linkToAdPipelineByAngle: triple,
  };
  if (sel === 0 || sel === 1 || sel === 2) {
    const active = triple[sel];
    const kn = normalizeKlingByReference({
      klingByReferenceIndex: active.klingByReferenceIndex,
      klingVideoUrl: snap.klingVideoUrl,
      klingTaskId: snap.klingTaskId,
      nanoBananaSelectedImageIndex: active.nanoBananaSelectedImageIndex ?? snap.nanoBananaSelectedImageIndex,
    });
    return { ...next, ...flattenAnglePipeToTopLevel(active, kn) };
  }
  return next;
}

/**
 * Normalize persisted slots to length 3; migrate legacy top-level Kling fields into the selected reference index.
 */
export function normalizeKlingByReference(
  snap: Pick<
    LinkToAdUniverseSnapshotV1,
    "klingByReferenceIndex" | "klingVideoUrl" | "klingTaskId" | "nanoBananaSelectedImageIndex"
  >,
): KlingReferenceSlotV1[] {
  const slots = createEmptyKlingByReference();
  const raw = snap.klingByReferenceIndex;
  if (Array.isArray(raw)) {
    for (let i = 0; i < 3 && i < raw.length; i++) {
      const s = raw[i];
      if (s && typeof s === "object") {
        const o = s as Record<string, unknown>;
        slots[i] = {
          videoUrl: typeof o.videoUrl === "string" ? o.videoUrl : o.videoUrl === null ? null : null,
          taskId: typeof o.taskId === "string" ? o.taskId : o.taskId === null ? null : null,
          history:
            Array.isArray(o.history) && o.history.every((x) => typeof x === "string") ? [...(o.history as string[])] : [],
          ugcVideoPrompt: typeof o.ugcVideoPrompt === "string" ? o.ugcVideoPrompt : undefined,
        };
      }
    }
  }
  const hasAnySlotData = slots.some((s) => s.videoUrl || s.taskId || (s.history && s.history.length) || s.ugcVideoPrompt);
  if (!hasAnySlotData) {
    const lv = typeof snap.klingVideoUrl === "string" ? snap.klingVideoUrl.trim() : "";
    const lt = typeof snap.klingTaskId === "string" ? snap.klingTaskId.trim() : "";
    const idx =
      snap.nanoBananaSelectedImageIndex === 0 || snap.nanoBananaSelectedImageIndex === 1 || snap.nanoBananaSelectedImageIndex === 2
        ? snap.nanoBananaSelectedImageIndex
        : 0;
    if (lv || lt) {
      slots[idx] = {
        ...slots[idx],
        videoUrl: lv || null,
        taskId: lt || null,
      };
    }
  }
  return slots;
}

/** True if any reference slot has a Kling task in progress (URL not ready yet), any script angle. */
export function universeHasPendingKlingTask(snap: LinkToAdUniverseSnapshotV1 | null): boolean {
  if (!snap) return false;
  const triple = normalizePipelineByAngle(snap);
  for (const pipe of triple) {
    const slots = pipe.klingByReferenceIndex;
    if (!Array.isArray(slots)) continue;
    for (const s of slots) {
      const tid = typeof s.taskId === "string" ? s.taskId.trim() : "";
      const v = typeof s.videoUrl === "string" ? s.videoUrl.trim() : "";
      if (tid && !v) return true;
    }
  }
  return false;
}

/** First slot index waiting on Kling (for server finalize), or null if none. */
export function findPendingKlingSlotIndex(snap: LinkToAdUniverseSnapshotV1): number | null {
  const slots = normalizeKlingByReference(snap);
  for (let i = 0; i < slots.length; i++) {
    const tid = typeof slots[i].taskId === "string" ? slots[i].taskId!.trim() : "";
    const v = typeof slots[i].videoUrl === "string" ? slots[i].videoUrl!.trim() : "";
    if (tid && !v) return i;
  }
  return null;
}

/** Apply a successful Kling result to one reference slot (prepend previous URL to history). */
export function snapshotAfterKlingVideoSuccess(
  snap: LinkToAdUniverseSnapshotV1,
  slotIndex: 0 | 1 | 2,
  videoUrl: string,
  taskId: string,
): LinkToAdUniverseSnapshotV1 {
  const slots = normalizeKlingByReference(snap).map(cloneSlot);
  const cur = slots[slotIndex];
  const prevUrl = typeof cur.videoUrl === "string" ? cur.videoUrl.trim() : "";
  let history = [...(cur.history || [])];
  if (prevUrl && prevUrl !== videoUrl) {
    history = [prevUrl, ...history.filter((u) => u !== prevUrl)];
  }
  slots[slotIndex] = {
    ...cur,
    videoUrl,
    taskId,
    history: history.slice(0, 12),
  };
  const sel = snap.nanoBananaSelectedImageIndex;
  const mirrorIdx = sel === 0 || sel === 1 || sel === 2 ? sel : slotIndex;
  const mirror = slots[mirrorIdx];
  return {
    ...snap,
    klingByReferenceIndex: slots,
    klingVideoUrl: mirror?.videoUrl ?? null,
    klingTaskId: mirror?.taskId ?? null,
  };
}

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
  klingByReferenceIndex: undefined,
  linkToAdPipelineByAngle: undefined,
};

export function readUniverseFromExtracted(extracted: unknown): LinkToAdUniverseSnapshotV1 | null {
  if (!extracted || typeof extracted !== "object") return null;
  const u = (extracted as Record<string, unknown>).__universe;
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  if (o.v !== 1) return null;
  const clean = o.cleanCandidate;
  const base: LinkToAdUniverseSnapshotV1 = {
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
    klingByReferenceIndex:
      Array.isArray(o.klingByReferenceIndex) && o.klingByReferenceIndex.length > 0
        ? (o.klingByReferenceIndex as KlingReferenceSlotV1[])
        : null,
    linkToAdPipelineByAngle:
      Array.isArray(o.linkToAdPipelineByAngle) && o.linkToAdPipelineByAngle.length >= 3
        ? (o.linkToAdPipelineByAngle as NonNullable<LinkToAdUniverseSnapshotV1["linkToAdPipelineByAngle"]>)
        : null,
  };
  const triple = normalizePipelineByAngle(base);
  let out: LinkToAdUniverseSnapshotV1 = { ...base, linkToAdPipelineByAngle: triple };
  const angSel = out.selectedAngleIndex;
  if (angSel === 0 || angSel === 1 || angSel === 2) {
    const active = triple[angSel];
    const kn = normalizeKlingByReference({
      klingByReferenceIndex: active.klingByReferenceIndex,
      klingVideoUrl: base.klingVideoUrl,
      klingTaskId: base.klingTaskId,
      nanoBananaSelectedImageIndex: active.nanoBananaSelectedImageIndex ?? base.nanoBananaSelectedImageIndex,
    });
    out = { ...out, ...flattenAnglePipeToTopLevel(active, kn) };
  } else {
    const normalized = normalizeKlingByReference({
      klingByReferenceIndex: base.klingByReferenceIndex,
      klingVideoUrl: base.klingVideoUrl,
      klingTaskId: base.klingTaskId,
      nanoBananaSelectedImageIndex: base.nanoBananaSelectedImageIndex,
    });
    const sel = base.nanoBananaSelectedImageIndex;
    const mirror = sel === 0 || sel === 1 || sel === 2 ? normalized[sel] : normalized[0];
    out = {
      ...out,
      klingByReferenceIndex: normalized,
      klingVideoUrl: mirror?.videoUrl ?? base.klingVideoUrl,
      klingTaskId: mirror?.taskId ?? base.klingTaskId,
    };
  }
  return out;
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
