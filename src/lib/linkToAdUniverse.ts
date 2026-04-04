/** Persisted Link to Ad Universe state (stored inside ugc_runs.extracted.__universe) */
export type LinkToAdUniverseSnapshotV1 = {
  v: 1;
  phase: "after_summary" | "after_scripts";
  generationMode?: "automatic" | "custom_ugc";
  /** AI provider used for scripts/prompts generation. */
  aiProvider?: "gpt" | "claude";
  customUgcIntent?: string;
  customUgcTopic?: string;
  customUgcOffer?: string;
  customUgcCta?: string;
  cleanCandidate: { url: string; reason?: string } | null;
  fallbackImageUrl: string | null;
  confidence: string | null;
  neutralUploadUrl: string | null;
  /** Packshot URLs from images-classify (product-only), best first — used to rebuild multi-angle GPT context. */
  productOnlyImageUrls?: string[] | null;
  /** User-uploaded additional product photos. */
  userPhotoUrls?: string[] | null;
  /** Persona / avatar reference URLs for scripts and Nano prompts. */
  personaPhotoUrls?: string[] | null;
  summaryText: string;
  scriptsText: string;
  /** One label per script angle (3 or 4 SCRIPT OPTION blocks). */
  angleLabels: string[];
  /** 0–3 when four angles are stored; video/image pipeline still uses slots 0–2 only (angle 3 mirrors slot 2 until extended). */
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
  const ai = sel === 0 || sel === 1 || sel === 2 ? sel : sel === 3 ? 2 : 0;
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
  const pSel = sel === 0 || sel === 1 || sel === 2 || sel === 3 ? Math.min(sel, 2) : null;
  if (pSel !== null) {
    const active = triple[pSel];
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
  "Pain & urgency: relatable frustration on camera, fast hook, pushes the viewer to stop scrolling and listen.",
  "Trust & proof: calmer energy, addresses doubts, shows why the product works without hard selling.",
  "Desire & transformation: benefit-led, paints the after-state and makes the product feel like the obvious next step.",
];

/** Max length for angle titles in the Link to Ad UI (headline + fallbacks). */
const ANGLE_LABEL_MAX_LEN = 280;

function clipAngleLabel(s: string, max = ANGLE_LABEL_MAX_LEN): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Pull persona / tone / setting hints from VIDEO_METADATA (before ANGLE_HEADLINE if present). */
function extractVideoMetadataHints(block: string): string {
  const start = block.search(/^\s*VIDEO_METADATA\s*$/im);
  if (start === -1) return "";
  const after = block.slice(start).replace(/^\s*VIDEO_METADATA\s*\n/im, "");
  const stop = after.search(/^\s*(?:ANGLE_HEADLINE|SCRIPT\s+OPTION)\b/im);
  const body = stop === -1 ? after : after.slice(0, stop);
  const priority = ["persona", "tone", "location", "camera_style", "energy_level", "props", "actions"];
  const picked: string[] = [];
  const used = new Set<string>();
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(persona|tone|location|camera_style|energy_level|props|actions)\s*[:：—\-]\s*(.+)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].replace(/\s+/g, " ").trim();
    if (!v || used.has(k)) continue;
    used.add(k);
    picked.push(v);
    if (picked.length >= 3) break;
  }
  return clipAngleLabel(picked.join(" · "), 140);
}

function hookQuotedLine(block: string): string | null {
  const hookSpoken = block.match(/HOOK\s*[\s\S]*?\([^)]*\)\s*\n\s*"([^"]+)"/i);
  const s = hookSpoken?.[1]?.trim();
  return s || null;
}

function solutionQuotedLine(block: string): string | null {
  const sol = block.match(/SOLUTION\s*[\s\S]*?\([^)]*\)\s*\n\s*"([^"]+)"/i);
  const s = sol?.[1]?.trim();
  return s || null;
}

/**
 * Split stored scripts into N SCRIPT OPTION blocks (any count ≥1).
 * Falls back to three equal chunks when no markers are found.
 */
export function splitAllScriptOptions(full: string): string[] {
  const text = full.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const re = /SCRIPT\s+OPTION\s*\d+\b/gi;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) starts.push(m.index);
  if (starts.length === 0) {
    const third = Math.max(1, Math.floor(text.length / 3));
    return [text.slice(0, third), text.slice(third, third * 2), text.slice(third * 2)];
  }
  const out: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    out.push(text.slice(start, end).trim());
  }
  return out;
}

/** First three SCRIPT OPTION bodies (legacy helpers). */
export function splitScriptOptions(full: string): [string, string, string] {
  const all = splitAllScriptOptions(full);
  return [all[0] ?? "", all[1] ?? "", all[2] ?? ""];
}

/** Strip a leading `SCRIPT OPTION n` line so we can re-wrap with {@link joinScriptOptionsFromBodies}. */
function stripScriptOptionHeaderN(n: number, block: string): string {
  const t = block.trim();
  const re = new RegExp(`^SCRIPT\\s+OPTION\\s*${n}\\b\\s*\\n*`, "i");
  return t.replace(re, "").trim();
}

/** Rebuild scripts text from any number of edited blocks (3 or 4 supported in UI). */
export function joinScriptOptionsFromBodies(bodies: string[]): string {
  if (bodies.length === 0) return "";
  return bodies
    .map((block, i) => {
      const n = i + 1;
      const stripped = stripScriptOptionHeaderN(n, block);
      return `SCRIPT OPTION ${n}\n\n${stripped}`;
    })
    .join("\n\n");
}

/** Rebuild full scripts text from three edited blocks (matches common GPT layout). */
export function joinScriptOptions(parts: [string, string, string]): string {
  return joinScriptOptionsFromBodies([parts[0], parts[1], parts[2]]);
}

export function selectedAngleScript(scriptsText: string, selectedAngleIndex: number | null): string {
  if (selectedAngleIndex == null || selectedAngleIndex < 0) return "";
  const all = splitAllScriptOptions(scriptsText);
  return all[selectedAngleIndex] ?? "";
}

/**
 * Rich angle title: prefers GPT ANGLE_HEADLINE, else VIDEO_METADATA hints + HOOK/SOLUTION quotes,
 * else first long quoted line. Kept in sync with `ugc-scripts-from-brief` output format.
 */
export function teaserFromScriptBlock(block: string, index: 0 | 1 | 2): string {
  const headline = block.match(/^\s*ANGLE_HEADLINE\s*:\s*(.+)$/im);
  if (headline?.[1]) {
    return clipAngleLabel(headline[1].replace(/\s+/g, " ").trim());
  }

  const meta = extractVideoMetadataHints(block);
  const hook = hookQuotedLine(block);
  const solution = solutionQuotedLine(block);
  const spokenParts: string[] = [];
  if (hook && solution && hook !== solution) {
    spokenParts.push(`${hook}: ${solution}`);
  } else if (hook) {
    spokenParts.push(hook);
  } else if (solution) {
    spokenParts.push(solution);
  }

  if (meta && spokenParts.length) {
    return clipAngleLabel(`${meta} · ${spokenParts[0]}`);
  }
  if (meta) {
    return clipAngleLabel(meta);
  }
  if (spokenParts.length) {
    return clipAngleLabel(spokenParts[0]);
  }

  const any = block.match(/"([^"]{10,400})"/);
  if (any?.[1]) {
    return clipAngleLabel(any[1].trim());
  }
  return FALLBACK_ANGLE_LABELS[index];
}

export function deriveAngleLabelsFromScripts(scriptsText: string): string[] {
  const parts = splitAllScriptOptions(scriptsText);
  return parts.map((block, i) => teaserFromScriptBlock(block, (i % 3) as 0 | 1 | 2));
}

function parseAngleLabelsFromSnapshot(o: Record<string, unknown>): string[] {
  const scriptsText = typeof o.scriptsText === "string" ? o.scriptsText : "";
  const parts = splitAllScriptOptions(scriptsText);
  const n = Math.min(4, Math.max(3, parts.length));
  const derived = deriveAngleLabelsFromScripts(scriptsText);
  const raw = o.angleLabels;
  if (!Array.isArray(raw) || raw.length < 3) {
    const out = [...derived];
    while (out.length < n) out.push("");
    return out.slice(0, n);
  }
  const fromRaw = raw.slice(0, n).map((x, i) => {
    const s = String(x).trim();
    return s || derived[i] || "";
  });
  while (fromRaw.length < n) fromRaw.push(derived[fromRaw.length] || "");
  return fromRaw.slice(0, n);
}

/**
 * Product brief: show an editable “hero” paragraph in projects; keep the rest for GPT but hidden by default.
 */
export function splitProductBriefForEditing(text: string): { hero: string; tail: string; useBrandPrefix: boolean } {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return { hero: "", tail: "", useBrandPrefix: false };
  const prefixMatch = raw.match(/^\s*(brand\s+brief\s*:)\s*/i);
  const useBrandPrefix = Boolean(prefixMatch);
  const body = prefixMatch ? raw.slice(prefixMatch[0].length).trim() : raw;
  if (!body) return { hero: "", tail: "", useBrandPrefix };
  const maxHero = 520;
  if (body.length <= maxHero) return { hero: body, tail: "", useBrandPrefix };
  const slice = body.slice(0, maxHero);
  const lastSent = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
  const cut = lastSent > 140 ? lastSent + 1 : maxHero;
  return {
    hero: body.slice(0, cut).trim(),
    tail: body.slice(cut).trim(),
    useBrandPrefix,
  };
}

export function mergeProductBriefForEditing(hero: string, tail: string, useBrandPrefix: boolean): string {
  const h = hero.replace(/\r\n/g, " ").replace(/\s+/g, " ").trim();
  const t = tail.replace(/\r\n/g, " ").replace(/\s+/g, " ").trim();
  const body = t ? `${h} ${t}`.replace(/\s+/g, " ").trim() : h;
  if (!body) return "";
  return useBrandPrefix ? `Brand brief: ${body}` : body;
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

/** Inverse of `parseThreeLabeledPrompts` — stable PROMPT 1/2/3 blocks for persistence and editing. */
export function composeThreeLabeledPrompts(bodies: [string, string, string]): string {
  const b = bodies.map((x) => x.replace(/\r\n/g, "\n").trim());
  if (!b[0] && !b[1] && !b[2]) return "";
  return ([1, 2, 3] as const)
    .map((n, i) => `PROMPT ${n}\n${b[i]}`)
    .join("\n\n");
}

export type NanoEditableSections = {
  person: string;
  scene: string;
  product: string;
};

/**
 * Cuts leaked TECHNICAL / NEGATIVE blocks from a single EDIT section body (model sometimes
 * inlines them before the next EDIT header).
 */
export function stripInlineTechnicalNoiseFromNanoSection(field: string): string {
  const t = field.replace(/\r\n/g, "\n");
  if (!t.trim()) return "";
  const patterns: RegExp[] = [
    /\n\s*NEGATIVE\s+PROMPT\b/i,
    /(?:^|\n)\s*TECHNICAL\s*[—:\s]/im,
    /\n\s*---+\s*NEGATIVE/i,
    /\n\s*PRESERVATION\s+INSTRUCTIONS\b/i,
    /\n\s*Standard\s+negative\s+prompt\b/i,
  ];
  let cut = t.length;
  for (const re of patterns) {
    const m = re.exec(t);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }
  return t.slice(0, cut).trim();
}

/** True when prompts use EDIT — / TECHNICAL: blocks from the image prompt API. */
export function parseNanoEditableSections(editable: string): NanoEditableSections & { isStructured: boolean } {
  const raw = editable.replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return { person: "", scene: "", product: "", isStructured: false };
  }
  if (!/EDIT\s*[—:-]\s*Person/im.test(raw)) {
    return {
      person: stripInlineTechnicalNoiseFromNanoSection(raw.trim()),
      scene: "",
      product: "",
      isStructured: false,
    };
  }
  const personM = raw.match(
    /EDIT\s*[—:-]\s*Person\s*[:\n]\s*([\s\S]*?)(?=\n\s*EDIT\s*[—:-]\s*Scene\b|\n\s*TECHNICAL\s*[—:\s]|\n\s*NEGATIVE\s+PROMPT\b|$)/i,
  );
  const sceneM = raw.match(
    /EDIT\s*[—:-]\s*Scene\s*[:\n]\s*([\s\S]*?)(?=\n\s*EDIT\s*[—:-]\s*Product\b|\n\s*TECHNICAL\s*[—:\s]|\n\s*NEGATIVE\s+PROMPT\b|$)/i,
  );
  const productM = raw.match(
    /EDIT\s*[—:-]\s*Product\s*(?:&|and)?\s*action\s*[:\n]\s*([\s\S]*?)(?=\n\s*TECHNICAL\s*[—:\s]|\n\s*NEGATIVE\s+PROMPT\b|$)/i,
  );
  return {
    person: stripInlineTechnicalNoiseFromNanoSection(personM?.[1]?.trim() ?? ""),
    scene: stripInlineTechnicalNoiseFromNanoSection(sceneM?.[1]?.trim() ?? ""),
    product: stripInlineTechnicalNoiseFromNanoSection(productM?.[1]?.trim() ?? ""),
    isStructured: true,
  };
}

export function composeNanoEditableSections(parts: NanoEditableSections): string {
  const p = parts.person.replace(/\r\n/g, "\n").trim();
  const s = parts.scene.replace(/\r\n/g, "\n").trim();
  const pr = parts.product.replace(/\r\n/g, "\n").trim();
  const lines: string[] = [];
  if (p) lines.push(`EDIT — Person:\n${p}`);
  if (s) lines.push(`EDIT — Scene:\n${s}`);
  if (pr) lines.push(`EDIT — Product & action:\n${pr}`);
  return lines.join("\n\n");
}

/**
 * Splits one NanoBanana prompt body into EDIT sections (user-facing) vs technical tail
 * (lighting, camera, preservation, negative prompt). Rejoin with mergeNanoPromptForApi.
 */
export function splitNanoPromptBodyForEditing(body: string): { editable: string; technicalTail: string } {
  const t = body.replace(/\r\n/g, "\n");
  if (!t.trim()) return { editable: "", technicalTail: "" };

  const patterns: RegExp[] = [
    /(?:^|\n)\s*TECHNICAL\s*[—:\s]/im,
    /^\s*NEGATIVE\s+PROMPT\b/im,
    /\n\s*NEGATIVE\s+PROMPT\b/i,
    /\n\s*---+\s*NEGATIVE/i,
    /\n\s*PRESERVATION\s+INSTRUCTIONS\b/i,
    /\n\s*Standard\s+negative\s+prompt\b/i,
  ];

  let cut = t.length;
  for (const re of patterns) {
    const m = re.exec(t);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }

  if (cut >= t.length) {
    return { editable: t.trim(), technicalTail: "" };
  }

  return {
    editable: t.slice(0, cut).trim(),
    technicalTail: t.slice(cut).trim(),
  };
}

export function mergeNanoPromptForApi(editable: string, technicalTail: string): string {
  const e = editable.trim();
  const tail = technicalTail.trim();
  if (!tail) return e;
  if (!e) return tail;
  return `${e}\n\n${tail}`;
}

/** User-facing slice of the UGC image-to-video prompt (shown in Link to Ad UI). */
export type VideoPromptEditableSections = {
  motion: string;
  dialogue: string;
  ambience: string;
};

/** True when the video prompt uses EDIT — Motion / Dialogue / Ambience blocks. */
export function parseVideoPromptEditableSections(editable: string): VideoPromptEditableSections & { isStructured: boolean } {
  const raw = editable.replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return { motion: "", dialogue: "", ambience: "", isStructured: false };
  }
  if (!/EDIT\s*[—:-]\s*Motion\b/im.test(raw)) {
    return { motion: raw.trim(), dialogue: "", ambience: "", isStructured: false };
  }
  const motionM = raw.match(/EDIT\s*[—:-]\s*Motion\s*[:\n]\s*([\s\S]*?)(?=\n\s*EDIT\s*[—:-]\s*Dialogue\b|$)/i);
  const dialogueM = raw.match(/EDIT\s*[—:-]\s*Dialogue\s*[:\n]\s*([\s\S]*?)(?=\n\s*EDIT\s*[—:-]\s*Ambience\b|$)/i);
  const ambienceM = raw.match(/EDIT\s*[—:-]\s*Ambience\s*[:\n]\s*([\s\S]*?)$/i);
  return {
    motion: motionM?.[1]?.trim() ?? "",
    dialogue: dialogueM?.[1]?.trim() ?? "",
    ambience: ambienceM?.[1]?.trim() ?? "",
    isStructured: true,
  };
}

export function composeVideoPromptEditableSections(parts: VideoPromptEditableSections): string {
  const m = parts.motion.replace(/\r\n/g, "\n").trim();
  const d = parts.dialogue.replace(/\r\n/g, "\n").trim();
  const a = parts.ambience.replace(/\r\n/g, "\n").trim();
  const lines: string[] = [];
  if (m) lines.push(`EDIT — Motion:\n${m}`);
  if (d) lines.push(`EDIT — Dialogue:\n${d}`);
  if (a) lines.push(`EDIT — Ambience:\n${a}`);
  return lines.join("\n\n");
}

/**
 * Splits stored video prompt into UI-visible creative text vs hidden technical/fidelity tail.
 * Legacy outputs without TECHNICAL may still end with device-spec spam; tuck that after a heuristic cut.
 */
export function splitUgcVideoPromptForEditing(body: string): { editable: string; technicalTail: string } {
  const t = body.replace(/\r\n/g, "\n");
  if (!t.trim()) return { editable: "", technicalTail: "" };

  const tech = /(?:^|\n)\s*TECHNICAL\s*[—:\s]/im.exec(t);
  if (tech && tech.index !== undefined) {
    return {
      editable: t.slice(0, tech.index).trim(),
      technicalTail: t.slice(tech.index).trim(),
    };
  }

  const deviceLine = /\n(?=\s*(?:Shot on|Recorded with)\s+(?:an\s+)?iPhone\b)/i.exec(t);
  if (deviceLine && deviceLine.index !== undefined) {
    return {
      editable: t.slice(0, deviceLine.index).trim(),
      technicalTail: t.slice(deviceLine.index).replace(/^\n+/, "").trim(),
    };
  }

  return { editable: t.trim(), technicalTail: "" };
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
    generationMode:
      o.generationMode === "custom_ugc" || o.generationMode === "automatic"
        ? (o.generationMode as "automatic" | "custom_ugc")
        : "automatic",
    aiProvider: o.aiProvider === "claude" ? "claude" : "gpt",
    customUgcIntent: typeof o.customUgcIntent === "string" ? o.customUgcIntent : "",
    customUgcTopic: typeof o.customUgcTopic === "string" ? o.customUgcTopic : "",
    customUgcOffer: typeof o.customUgcOffer === "string" ? o.customUgcOffer : "",
    customUgcCta: typeof o.customUgcCta === "string" ? o.customUgcCta : "",
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
    userPhotoUrls:
      Array.isArray(o.userPhotoUrls) && o.userPhotoUrls.every((x) => typeof x === "string")
        ? (o.userPhotoUrls as string[])
        : null,
    personaPhotoUrls:
      Array.isArray(o.personaPhotoUrls) && o.personaPhotoUrls.every((x) => typeof x === "string")
        ? (o.personaPhotoUrls as string[])
        : null,
    summaryText: typeof o.summaryText === "string" ? o.summaryText : "",
    scriptsText: typeof o.scriptsText === "string" ? o.scriptsText : "",
    angleLabels: parseAngleLabelsFromSnapshot(o),
    selectedAngleIndex:
      typeof o.selectedAngleIndex === "number" && o.selectedAngleIndex >= 0 && o.selectedAngleIndex <= 3
        ? o.selectedAngleIndex
        : null,
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
  const pipeIdx = angSel === 0 || angSel === 1 || angSel === 2 || angSel === 3 ? Math.min(angSel, 2) : null;
  if (pipeIdx !== null) {
    const active = triple[pipeIdx];
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
