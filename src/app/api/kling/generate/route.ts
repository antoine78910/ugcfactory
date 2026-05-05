export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { mirrorImageUrlForPiapiSeedance } from "@/lib/mirrorImageUrlForPiapi";
import {
  mirrorAudioUrlForPiapiSeedance,
  mirrorVideoUrlForPiapiSeedance,
} from "@/lib/mirrorSeedanceReferenceMedia";
import { resolveKieVideoPickerToMarketModel } from "@/lib/kieVideoModelResolver";
import {
  SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS,
  SEEDANCE_PRO_MAX_AUDIO_URLS,
  SEEDANCE_PRO_MAX_IMAGE_URLS,
  SEEDANCE_PRO_MAX_VIDEO_URLS,
  SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS,
  SEEDANCE_PRO_PROMPT_MAX_CHARS,
} from "@/lib/piapiSeedance";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import {
  canUseStudioVideoModel,
  parseAccountPlan,
  studioVideoUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getUserPlan } from "@/lib/supabase/getUserPlan";
import { isKieServableReferenceImageUrl } from "@/lib/kieSoraReferenceImage";
import {
  validateStudioVideoJobDuration,
  studioVideoIsSeedance2ProPickerId,
  studioVideoSupportsReferenceElements,
  normalizeLegacySeedanceMarketModelId,
} from "@/lib/studioVideoModelCapabilities";
import { inferSeedanceReferenceKindFromUrl } from "@/lib/seedanceReferenceUrlKind";

type KlingAspectRatio = "16:9" | "9:16" | "1:1";
type KlingMode = "std" | "pro";

type KlingMultiPromptShot = { prompt: string; duration: number };
type KlingElementInput = {
  name: string;
  description?: string;
  element_input_urls: string[];
};

type Body = {
  /** Client plan (demo: localStorage). When set, premium models are rejected for lower tiers. */
  accountPlan?: string;
  /** Link to Ad video: do not gate by subscription tier (credits still apply in-app). */
  linkToAd?: boolean;
  // KIE Market model id (optional; defaults to Kling 3.0)
  marketModel?: string;
  prompt: string;
  imageUrl?: string;
  /** Last frame for Kling 3.0 (two URLs in `image_urls`) and Seedance first/last ordering. */
  endImageUrl?: string;
  duration?: number; // seconds
  aspectRatio?: KlingAspectRatio; // optional if image is provided
  sound?: boolean;
  mode?: KlingMode;
  /** Kling 3.0 only, multi-shot sequencing */
  multiShots?: boolean;
  /** Kling 3.0 only, when `multiShots` is true, each shot prompt + duration (seconds). */
  multiPrompt?: KlingMultiPromptShot[];
  /**
   * Kling 3.0: `@name` in prompts + `kling_elements` in the Market payload.
   * Seedance: same shape; URLs are flattened (start → element refs → end), then split into image / video / audio lists for the provider.
   * Prompt uses `@imageN` / `@videoN` / `@audioN` (tags may be auto-prefixed). Max 12 refs (Pro) / 9 (Preview) image URLs; Preview elements are images only.
   */
  klingElements?: KlingElementInput[];
  /**
   * Optional extra image URLs (1–4) for Seedance 2 / 2 Fast (e.g. Link to Ad, legacy clients).
   * With `klingElements`, the first URL is the start frame; remaining compact URLs append after element refs.
   */
  seedancePreviewImageUrls?: string[];
  /**
   * Seedance 2 / Fast only: ordered omni references (images, videos, audio).
   * With `klingElements`, the first image URL is @image1; element URLs follow, then remaining omni images.
   */
  seedanceOmniMedia?: { type: "image" | "video" | "audio"; url: string }[];
  personalApiKey?: string;
  piapiApiKey?: string;
  /** Kie Seedance: 480p / 720p / 1080p (1080p is downgraded to 720p for `bytedance/seedance-2-fast`). */
  videoResolution?: "480p" | "720p" | "1080p";
  /** Kie Seedance 2.0 / 2.0 Fast: optional online search (higher cost on provider). */
  webSearch?: boolean;
  /** When true, enable provider content checks (if supported). */
  nsfwChecker?: boolean;
};

/** Per-shot length, Kling 3.0 Market API: integer 1–12 seconds each. @see https://docs.kie.ai/market/kling/kling-3-0 */
const KLING_SHOT_DURATION_MIN = 1;
const KLING_SHOT_DURATION_MAX = 12;
const KLING_MULTI_MAX_SHOTS = 5;
const KLING_ELEMENT_MAX = 3;

/** Total clip length, Kling 3.0 `input.duration` string enum 3…15 must equal sum of `multi_prompt` durations. */
const KLING_TOTAL_DURATION_MIN = 3;
const KLING_TOTAL_DURATION_MAX = 15;

function extractNamedElementMentionsFromPrompts(prompts: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of prompts) {
    const p = (raw ?? "").trim();
    if (!p.includes("@")) continue;
    const re = /@([a-zA-Z_][a-zA-Z0-9_-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p)) !== null) {
      const token = (m[1] ?? "").trim().toLowerCase();
      if (!token) continue;
      // Seedance uploaded media tags are not saved Elements rows.
      if (/^image\d+$/.test(token)) continue;
      if (/^video\d+$/.test(token)) continue;
      if (/^audio\d+$/.test(token)) continue;
      out.add(token);
    }
  }
  return out;
}

/**
 * Studio UX rule: only Elements explicitly referenced in the prompt should be forwarded.
 *
 * Exception: workflow auto-binding emits synthetic rows named `imageN` (see `workflowNodeRun.ts`).
 * Those may be present without `@imageN` mentions because Kling keeps prompt text untouched.
 */
function filterKlingElementsPayloadForPromptMentions(
  elements: KlingElementInput[],
  mentionNames: Set<string>,
): KlingElementInput[] {
  if (!elements.length) return elements;
  const hasUserNamedElement = elements.some((el) => {
    const n = String(el.name ?? "").trim().toLowerCase();
    if (!n) return false;
    return !/^image\d+$/.test(n);
  });
  if (!hasUserNamedElement) {
    // Workflow-style synthetic elements only.
    return elements;
  }
  if (mentionNames.size === 0) {
    return [];
  }
  return elements.filter((el) => {
    const n = String(el.name ?? "").trim().toLowerCase();
    if (!n) return false;
    if (/^image\d+$/.test(n)) return true;
    return mentionNames.has(n);
  });
}

function normalizeKlingMultiPrompt(body: Body): {
  ok: true;
  shots: { prompt: string; duration: number }[];
  totalSec: number;
} | { ok: false; error: string } {
  const raw = body.multiPrompt;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Missing or empty `multiPrompt` for multi-shot." };
  }
  if (raw.length > KLING_MULTI_MAX_SHOTS) {
    return { ok: false, error: `Multi-shot supports at most ${KLING_MULTI_MAX_SHOTS} shots.` };
  }
  const shots: { prompt: string; duration: number }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    const p = typeof row?.prompt === "string" ? row.prompt.trim() : "";
    if (!p) {
      return { ok: false, error: `Shot ${i + 1}: prompt is required.` };
    }
    if (p.length > 500) {
      return { ok: false, error: `Shot ${i + 1}: prompt must be at most 500 characters.` };
    }
    const n = Number((row as { duration?: unknown })?.duration);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return {
        ok: false,
        error: `Shot ${i + 1}: duration must be a whole number of seconds (${KLING_SHOT_DURATION_MIN}–${KLING_SHOT_DURATION_MAX}).`,
      };
    }
    const d = n;
    if (d < KLING_SHOT_DURATION_MIN || d > KLING_SHOT_DURATION_MAX) {
      return {
        ok: false,
        error: `Shot ${i + 1}: duration must be an integer from ${KLING_SHOT_DURATION_MIN} to ${KLING_SHOT_DURATION_MAX} seconds (Kling 3.0 API).`,
      };
    }
    shots.push({ prompt: p, duration: d });
  }
  const totalSec = shots.reduce((a, s) => a + s.duration, 0);
  if (totalSec < KLING_TOTAL_DURATION_MIN || totalSec > KLING_TOTAL_DURATION_MAX) {
    return {
      ok: false,
      error: `Total multi-shot duration must be between ${KLING_TOTAL_DURATION_MIN} and ${KLING_TOTAL_DURATION_MAX} seconds (sum of shot lengths; must match Kling \`duration\` field).`,
    };
  }
  return { ok: true, shots, totalSec };
}

function normalizeKlingElements(
  raw: unknown,
  opts?: { minUrlsPerElement?: number },
): { ok: true; elements: KlingElementInput[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, elements: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "`klingElements` must be an array." };
  if (raw.length > KLING_ELEMENT_MAX) {
    return { ok: false, error: `At most ${KLING_ELEMENT_MAX} Kling elements are allowed.` };
  }
  const minUrls = opts?.minUrlsPerElement ?? 2;
  const elements: KlingElementInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as KlingElementInput | null;
    const name = typeof row?.name === "string" ? row.name.trim() : "";
    if (!name) {
      return { ok: false, error: `Element ${i + 1}: name is required.` };
    }
    const desc =
      typeof row?.description === "string" && row.description.trim()
        ? row.description.trim()
        : name;
    const urls = Array.isArray(row?.element_input_urls)
      ? row.element_input_urls.map((u) => String(u ?? "").trim()).filter(Boolean)
      : [];
    if (urls.length < minUrls || urls.length > 4) {
      const seedanceEl = minUrls === 1;
      return {
        ok: false,
        error: seedanceEl
          ? `Element "${name}": provide between 1 and 4 reference URLs (HTTPS image, video, or audio).`
          : `Element "${name}": provide between ${minUrls} and 4 reference image URLs.`,
      };
    }
    elements.push({ name, description: desc, element_input_urls: urls });
  }
  return { ok: true, elements };
}

function pushUniqueMediaUrl(out: string[], raw: string, max: number): void {
  const u = String(raw ?? "").trim();
  if (!u || out.includes(u) || out.length >= max) return;
  out.push(u);
}

/** Start frame, then each element’s reference URLs, then optional end frame (flattened Seedance order before bucketing). */
function buildSeedanceOrderedReferenceUrls(
  start: string,
  end: string | undefined,
  elements: KlingElementInput[],
  max: number,
): string[] {
  const out: string[] = [];
  pushUniqueMediaUrl(out, start, max);
  for (const el of elements) {
    for (const u of el.element_input_urls) {
      pushUniqueMediaUrl(out, u, max);
    }
  }
  if (end) pushUniqueMediaUrl(out, end, max);
  return out;
}

/** Kie Seedance 2.0 `input.aspect_ratio` (includes `adaptive` for “auto”). */
function mapAspectRatioForKieSeedance2(raw: string | undefined): string {
  const a = String(raw ?? "16:9").trim();
  if (a === "auto") return "adaptive";
  switch (a) {
    case "1:1":
    case "4:3":
    case "3:4":
    case "16:9":
    case "9:16":
    case "21:9":
      return a;
    default:
      return "16:9";
  }
}

/** Kie Market Seedance 2.0 reference caps (@see docs.kie.ai/market/bytedance/seedance-2). */
const KIE_SEEDANCE2_MAX_REF_IMAGES = 9;
const KIE_SEEDANCE2_MAX_REF_VIDEOS = 3;
const KIE_SEEDANCE2_MAX_REF_AUDIOS = 3;

function partitionSeedanceReferenceUrls(ordered: string[]): {
  imgs: string[];
  vids: string[];
  auds: string[];
} {
  const imgs: string[] = [];
  const vids: string[] = [];
  const auds: string[] = [];
  for (const u of ordered) {
    const k = inferSeedanceReferenceKindFromUrl(u);
    if (k === "audio") auds.push(u);
    else if (k === "video") vids.push(u);
    else imgs.push(u);
  }
  return { imgs, vids, auds };
}

function maxPromptMediaMention(prompt: string, kind: "image" | "video" | "audio"): number {
  const re = new RegExp(`@${kind}(\\d+)\\b`, "gi");
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function seedanceMarketModelSupportsCompactReferenceUrls(raw: string): boolean {
  return raw === "bytedance/seedance-2" || raw === "bytedance/seedance-2-fast";
}

function normalizeSeedanceGeneratePrompt(rawPrompt: string): string {
  return rawPrompt.replace(/\s+/g, " ").trim();
}

function normalizeSeedanceCompactPreviewUrls(
  body: Body,
): { ok: true; urls: string[] } | { ok: false; error: string } {
  const raw = body.seedancePreviewImageUrls;
  if (raw == null) return { ok: true, urls: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "`seedancePreviewImageUrls` must be an array." };
  }
  if (raw.length === 0) return { ok: true, urls: [] };
  if (raw.length > SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS) {
    return {
      ok: false,
      error: `At most ${SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS} images are allowed for compact Seedance reference uploads.`,
    };
  }
  const urls: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const u = typeof raw[i] === "string" ? raw[i]!.trim() : "";
    if (!u) {
      return { ok: false, error: `Reference image ${i + 1}: URL is empty.` };
    }
    if (!isKieServableReferenceImageUrl(u)) {
      return {
        ok: false,
        error: `Reference image ${i + 1}: must be a reachable HTTPS image URL.`,
      };
    }
    if (seen.has(u)) continue;
    seen.add(u);
    urls.push(u);
  }
  if (!urls.length) {
    return { ok: false, error: "`seedancePreviewImageUrls` must contain at least one valid image URL." };
  }
  return { ok: true, urls };
}

type SeedanceOmniMediaItem = { type: "image" | "video" | "audio"; url: string };

function normalizeSeedanceOmniMedia(
  body: Body,
): { ok: true; items: SeedanceOmniMediaItem[] } | { ok: false; error: string } {
  const raw = body.seedanceOmniMedia;
  if (raw == null) return { ok: true, items: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "`seedanceOmniMedia` must be an array." };
  }
  if (raw.length > SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS) {
    return {
      ok: false,
      error: `At most ${SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS} Seedance omni references are allowed.`,
    };
  }
  const items: SeedanceOmniMediaItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as { type?: unknown; url?: unknown };
    const t = typeof row?.type === "string" ? row.type.trim().toLowerCase() : "";
    if (t !== "image" && t !== "video" && t !== "audio") {
      return { ok: false, error: `Reference ${i + 1}: type must be image, video, or audio.` };
    }
    const u = typeof row?.url === "string" ? row.url.trim() : "";
    if (!u) {
      return { ok: false, error: `Reference ${i + 1}: url is required.` };
    }
    if (!isKieServableReferenceImageUrl(u)) {
      return { ok: false, error: `Reference ${i + 1}: must be a reachable HTTPS URL.` };
    }
    if (seen.has(u)) continue;
    seen.add(u);
    items.push({ type: t as "image" | "video" | "audio", url: u });
  }
  const img = items.filter((x) => x.type === "image").length;
  const vid = items.filter((x) => x.type === "video").length;
  const aud = items.filter((x) => x.type === "audio").length;
  if (img > SEEDANCE_PRO_MAX_IMAGE_URLS) {
    return { ok: false, error: `At most ${SEEDANCE_PRO_MAX_IMAGE_URLS} Seedance omni images are allowed.` };
  }
  if (vid > SEEDANCE_PRO_MAX_VIDEO_URLS) {
    return { ok: false, error: `At most ${SEEDANCE_PRO_MAX_VIDEO_URLS} Seedance omni video is allowed.` };
  }
  if (aud > SEEDANCE_PRO_MAX_AUDIO_URLS) {
    return { ok: false, error: `At most ${SEEDANCE_PRO_MAX_AUDIO_URLS} Seedance omni audio track is allowed.` };
  }
  if (items.length > 0 && aud > 0 && img === 0 && vid === 0) {
    return {
      ok: false,
      error: "Seedance omni mode does not allow audio-only references. Add at least one image or video.",
    };
  }
  return { ok: true, items };
}

function isKling26(model: string): boolean {
  return (
    model === "kling-2.6/video" ||
    model === "kling-2.6/image-to-video" ||
    model === "kling-2.6/text-to-video"
  );
}

function isKling25Turbo(model: string): boolean {
  return (
    model === "kling-2.5-turbo/video" ||
    model === "kling-2.5-turbo/image-to-video" ||
    model === "kling-2.5-turbo/text-to-video" ||
    model === "kling/v2-5-turbo-image-to-video-pro" ||
    model === "kling/v2-5-turbo-text-to-video-pro"
  );
}

function isKling25TurboImageToVideo(model: string): boolean {
  return model === "kling/v2-5-turbo-image-to-video-pro" || model === "kling-2.5-turbo/image-to-video";
}

function isSora2(model: string): boolean {
  return (
    model === "openai/sora-2" ||
    model === "sora-2-image-to-video" ||
    model === "sora-2-text-to-video"
  );
}

function isSora2Pro(model: string): boolean {
  return (
    model === "openai/sora-2-pro" ||
    model === "sora-2-pro-text-to-video" ||
    model === "sora-2-pro-image-to-video"
  );
}

export async function POST(req: Request) {
  const { user, response } = await requireSupabaseUser();
  if (response) return response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawModel = normalizeLegacySeedanceMarketModelId(
    (body.marketModel ?? "kling-3.0/video").trim() || "kling-3.0/video",
  );
  const imageUrlRaw = (body.imageUrl ?? "").trim();
  const endImageUrlRaw = (body.endImageUrl ?? "").trim();
  const hasKieReferenceImage = isKieServableReferenceImageUrl(imageUrlRaw);
  const hasKieEndImage = isKieServableReferenceImageUrl(endImageUrlRaw);
  const compactNorm = normalizeSeedanceCompactPreviewUrls(body);
  if (!compactNorm.ok) {
    return NextResponse.json({ error: compactNorm.error }, { status: 400 });
  }
  if (compactNorm.urls.length > 0 && !seedanceMarketModelSupportsCompactReferenceUrls(rawModel)) {
    return NextResponse.json(
      { error: "`seedancePreviewImageUrls` is only valid for Seedance 2.0 or Seedance 2.0 Fast." },
      { status: 400 },
    );
  }
  const useCompactSeedancePreviewRefs =
    seedanceMarketModelSupportsCompactReferenceUrls(rawModel) && compactNorm.urls.length > 0;

  const omniNorm = normalizeSeedanceOmniMedia(body);
  if (!omniNorm.ok) {
    return NextResponse.json({ error: omniNorm.error }, { status: 400 });
  }
  if (omniNorm.items.length > 0 && !studioVideoIsSeedance2ProPickerId(rawModel)) {
    return NextResponse.json(
      { error: "`seedanceOmniMedia` is only valid for Seedance 2 or Seedance 2 Fast." },
      { status: 400 },
    );
  }
  const useSeedanceProOmniRefs = studioVideoIsSeedance2ProPickerId(rawModel) && omniNorm.items.length > 0;
  if (useSeedanceProOmniRefs && (hasKieReferenceImage || hasKieEndImage)) {
    return NextResponse.json(
      {
        error: "When using `seedanceOmniMedia`, omit `imageUrl` and `endImageUrl`.",
      },
      { status: 400 },
    );
  }

  const model = resolveKieVideoPickerToMarketModel(rawModel, hasKieReferenceImage);
  const prompt = (body.prompt ?? "").trim();

  const kling30Multi =
    model === "kling-3.0/video" &&
    body.multiShots === true &&
    Array.isArray(body.multiPrompt) &&
    body.multiPrompt.length > 0;
  const multiNorm = kling30Multi ? normalizeKlingMultiPrompt(body) : null;
  if (multiNorm && !multiNorm.ok) {
    return NextResponse.json({ error: multiNorm.error }, { status: 400 });
  }
  const supportsReferenceElements = studioVideoSupportsReferenceElements(rawModel);
  const elementUrlMin = studioVideoIsSeedance2ProPickerId(rawModel) ? 1 : 2;
  const elementsNorm = supportsReferenceElements
    ? normalizeKlingElements(body.klingElements, { minUrlsPerElement: elementUrlMin })
    : { ok: true as const, elements: [] };
  if (!elementsNorm.ok) {
    return NextResponse.json({ error: elementsNorm.error }, { status: 400 });
  }

  const mentionPrompts =
    multiNorm && multiNorm.ok
      ? [...multiNorm.shots.map((s) => String(s.prompt ?? "").trim()).filter(Boolean), prompt].filter(Boolean)
      : [prompt].filter(Boolean);
  const mentionNames = supportsReferenceElements
    ? extractNamedElementMentionsFromPrompts(mentionPrompts)
    : new Set<string>();
  const klingElementsForJob = supportsReferenceElements
    ? filterKlingElementsPayloadForPromptMentions(elementsNorm.elements, mentionNames)
    : [];

  if (model === "kling-3.0/video" && klingElementsForJob.length > 0 && !hasKieReferenceImage) {
    return NextResponse.json(
      {
        error:
          "Kling 3.0 requires a start frame (`imageUrl`) when using element references (`kling_elements` / @name in prompts).",
      },
      { status: 400 },
    );
  }

  if (rawModel.startsWith("bytedance/seedance") && klingElementsForJob.length > 0) {
    const hasSeedanceStart =
      hasKieReferenceImage ||
      (useCompactSeedancePreviewRefs && compactNorm.urls.length > 0) ||
      (useSeedanceProOmniRefs && omniNorm.items.some((it) => it.type === "image"));
    if (!hasSeedanceStart) {
      return NextResponse.json(
        {
          error:
            "Seedance requires at least one reference image for @image1 when using Elements: `imageUrl`, `seedancePreviewImageUrls`, or an image in `seedanceOmniMedia`.",
        },
        { status: 400 },
      );
    }
  }

  const effectivePrompt = kling30Multi && multiNorm?.ok ? multiNorm.shots[0]!.prompt : prompt;
  if (!effectivePrompt) {
    return NextResponse.json({ error: "Missing `prompt`." }, { status: 400 });
  }

  const personalKey = hasPersonalApiKey(body.personalApiKey) ? body.personalApiKey.trim() : undefined;
  const piapiKey = hasPersonalApiKey(body.piapiApiKey) ? body.piapiApiKey.trim() : undefined;
  if (!personalKey && !piapiKey) {
    // Fetch plan from DB (server-side); fall back to client claim only if table not yet available
    const dbPlan = await getUserPlan(user.id);
    const accountPlan = dbPlan !== "free" ? dbPlan : parseAccountPlan(body.accountPlan);
    const skipTierGate = body.linkToAd === true;
    if (!skipTierGate && !canUseStudioVideoModel(accountPlan, model)) {
      return NextResponse.json(
        {
          error: studioVideoUpgradeMessage(accountPlan, model) ?? "Subscription upgrade required for this model.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }

  const mode = body.mode ?? "pro";
  try {
    if (kling30Multi && multiNorm?.ok) {
      validateStudioVideoJobDuration(model, multiNorm.totalSec);
    } else {
      validateStudioVideoJobDuration(model, body.duration);
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid duration." },
      { status: 400 },
    );
  }

  try {
    let input: Record<string, unknown>;
    if (model === "kling-3.0/video") {
      if (kling30Multi && multiNorm?.ok) {
        const totalStr = String(multiNorm.totalSec);
        if (!/^(?:[3-9]|1[0-5])$/.test(totalStr)) {
          return NextResponse.json(
            { error: "Multi-shot total duration must be an integer from 3 to 15 (Kling 3.0 API)." },
            { status: 400 },
          );
        }
        input = {
          prompt: multiNorm.shots[0]!.prompt,
          sound: body.sound ?? true,
          duration: totalStr,
          mode,
          multi_shots: true,
          multi_prompt: multiNorm.shots.map((s) => ({
            prompt: s.prompt,
            duration: s.duration,
          })),
        };
        if (klingElementsForJob.length) {
          input.kling_elements = klingElementsForJob.map((el) => ({
            name: el.name,
            description: el.description,
            element_input_urls: el.element_input_urls,
          }));
        }
      } else {
        input = {
          prompt,
          sound: body.sound ?? true,
          duration: String(body.duration ?? 5),
          mode,
          multi_shots: false,
          multi_prompt: [],
        };
        if (klingElementsForJob.length) {
          input.kling_elements = klingElementsForJob.map((el) => ({
            name: el.name,
            description: el.description,
            element_input_urls: el.element_input_urls,
          }));
        }
      }

      if (hasKieReferenceImage) {
        const frameUrls = [imageUrlRaw];
        if (hasKieEndImage) frameUrls.push(endImageUrlRaw);
        input.image_urls = frameUrls;
      }
      // Kling 3.0 accepts aspect_ratio alongside image_urls (system auto-adapts when omitted).
      // @see https://docs.kie.ai/market/kling/kling-3-0
      if (body.aspectRatio) {
        input.aspect_ratio = body.aspectRatio;
      }
    } else if (isKling26(model) || isKling25Turbo(model)) {
      input = {
        prompt,
        sound: body.sound ?? false,
        duration: String(body.duration ?? 5),
      };
      if (hasKieReferenceImage) {
        if (isKling25TurboImageToVideo(model)) {
          input.image_url = imageUrlRaw;
        } else {
          input.image_urls = [imageUrlRaw];
        }
      } else if (body.aspectRatio) {
        input.aspect_ratio = body.aspectRatio;
      }
    } else if (isSora2(model) || isSora2Pro(model)) {
      const nFrames = String(body.duration ?? 10);
      const soraAspect = body.aspectRatio === "9:16" ? "portrait" : "landscape";
      const soraSize = (body.mode ?? "pro") === "pro" ? "high" : "standard";
      input = {
        prompt,
        n_frames: nFrames,
        aspect_ratio: soraAspect,
        size: soraSize,
        upload_method: "s3",
        remove_watermark: true,
      };
      if (hasKieReferenceImage) {
        input.image_urls = [imageUrlRaw];
      }
    } else if (rawModel.startsWith("bytedance/seedance")) {
      if (rawModel !== "bytedance/seedance-2" && rawModel !== "bytedance/seedance-2-fast") {
        return NextResponse.json(
          {
            error: `Unsupported Seedance model: ${rawModel}. Use bytedance/seedance-2 or bytedance/seedance-2-fast (Kie Market).`,
          },
          { status: 400 },
        );
      }

      if (hasKieEndImage && !hasKieReferenceImage && !useCompactSeedancePreviewRefs) {
        return NextResponse.json(
          { error: "Provide `imageUrl` (start frame) when using `endImageUrl` on Seedance." },
          { status: 400 },
        );
      }

      const maxImages = SEEDANCE_PRO_MAX_IMAGE_URLS;
      const duration = Number(body.duration ?? 10);
      const normalizedSeedancePrompt = normalizeSeedanceGeneratePrompt(prompt);
      if (!normalizedSeedancePrompt) {
        return NextResponse.json({ error: "Missing `prompt`." }, { status: 400 });
      }

      const seedancePromptCharCap = SEEDANCE_PRO_PROMPT_MAX_CHARS;
      const seedancePromptForKie =
        normalizedSeedancePrompt.length > seedancePromptCharCap
          ? normalizedSeedancePrompt.slice(0, seedancePromptCharCap).trim()
          : normalizedSeedancePrompt;

      const seedanceResolutionTier: "480p" | "720p" | "1080p" =
        body.videoResolution === "480p" || body.videoResolution === "720p" || body.videoResolution === "1080p"
          ? body.videoResolution
          : "720p";
      const kieResolution: "480p" | "720p" | "1080p" =
        rawModel === "bytedance/seedance-2-fast"
          ? seedanceResolutionTier === "1080p"
            ? "720p"
            : seedanceResolutionTier
          : seedanceResolutionTier;

      const kieDuration = Math.round(duration);
      if (!Number.isFinite(kieDuration) || kieDuration < 4 || kieDuration > 15) {
        return NextResponse.json(
          { error: "Kie Seedance requires a clip duration between 4 and 15 seconds." },
          { status: 400 },
        );
      }

      const kieInput: Record<string, unknown> = {
        prompt: seedancePromptForKie,
        aspect_ratio: mapAspectRatioForKieSeedance2(body.aspectRatio),
        resolution: kieResolution,
        duration: kieDuration,
        generate_audio: body.sound !== false,
      };
      if (body.webSearch === true) kieInput.web_search = true;
      if (body.nsfwChecker === true) kieInput.nsfw_checker = true;

      try {
        if (useSeedanceProOmniRefs) {
          const items = omniNorm.items;
          if (items.length > SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS) {
            return NextResponse.json(
              {
                error: `Too many Seedance omni references (${items.length}). Maximum is ${SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS}.`,
              },
              { status: 400 },
            );
          }
          const imageOrder: string[] = [];
          const videoOrder: string[] = [];
          const audioOrder: string[] = [];
          for (const it of items) {
            if (it.type === "image") imageOrder.push(it.url);
            else if (it.type === "video") videoOrder.push(it.url);
            else audioOrder.push(it.url);
          }
          let imagesToMirror: string[] = imageOrder;
          let videosToMirror: string[] = videoOrder;
          let audiosToMirror: string[] = audioOrder;
          if (klingElementsForJob.length > 0) {
            if (!imageOrder.length) {
              return NextResponse.json(
                {
                  error:
                    "Add at least one reference image in omni media when using Elements (needed for @image1).",
                },
                { status: 400 },
              );
            }
            const cap = SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS;
            const flat: string[] = [];
            pushUniqueMediaUrl(flat, imageOrder[0]!, cap);
            for (const el of klingElementsForJob) {
              for (const u of el.element_input_urls) {
                pushUniqueMediaUrl(flat, u, cap);
              }
            }
            for (let i = 1; i < imageOrder.length; i++) {
              pushUniqueMediaUrl(flat, imageOrder[i]!, cap);
            }
            for (const u of videoOrder) {
              pushUniqueMediaUrl(flat, u, cap);
            }
            for (const u of audioOrder) {
              pushUniqueMediaUrl(flat, u, cap);
            }
            if (flat.length > cap) {
              return NextResponse.json(
                {
                  error: `Too many Seedance references (${flat.length}). Maximum is ${cap} for this model.`,
                },
                { status: 400 },
              );
            }
            const part = partitionSeedanceReferenceUrls(flat);
            if (part.imgs.length > SEEDANCE_PRO_MAX_IMAGE_URLS) {
              return NextResponse.json(
                {
                  error: `Too many Seedance reference images (${part.imgs.length}). Maximum is ${SEEDANCE_PRO_MAX_IMAGE_URLS}.`,
                },
                { status: 400 },
              );
            }
            if (part.vids.length > SEEDANCE_PRO_MAX_VIDEO_URLS) {
              return NextResponse.json(
                {
                  error: `Too many Seedance reference videos (${part.vids.length}). Maximum is ${SEEDANCE_PRO_MAX_VIDEO_URLS}.`,
                },
                { status: 400 },
              );
            }
            if (part.auds.length > SEEDANCE_PRO_MAX_AUDIO_URLS) {
              return NextResponse.json(
                {
                  error: `Too many Seedance reference audios (${part.auds.length}). Maximum is ${SEEDANCE_PRO_MAX_AUDIO_URLS}.`,
                },
                { status: 400 },
              );
            }
            if (part.auds.length > 0 && part.imgs.length === 0 && part.vids.length === 0) {
              return NextResponse.json(
                {
                  error:
                    "Seedance omni mode does not allow audio-only references. Add at least one image or video when using Elements.",
                },
                { status: 400 },
              );
            }
            imagesToMirror = part.imgs;
            videosToMirror = part.vids;
            audiosToMirror = part.auds;
          }

          const mirroredImg: string[] = [];
          const mirroredVid: string[] = [];
          const mirroredAud: string[] = [];
          for (const u of imagesToMirror) {
            mirroredImg.push(await mirrorImageUrlForPiapiSeedance(u, user.id));
          }
          for (const u of videosToMirror) {
            mirroredVid.push(await mirrorVideoUrlForPiapiSeedance(u, user.id));
          }
          for (const u of audiosToMirror) {
            mirroredAud.push(await mirrorAudioUrlForPiapiSeedance(u, user.id));
          }
          if (mirroredImg.length > KIE_SEEDANCE2_MAX_REF_IMAGES) {
            return NextResponse.json(
              {
                error: `Kie Seedance allows at most ${KIE_SEEDANCE2_MAX_REF_IMAGES} reference images (you sent ${mirroredImg.length}).`,
              },
              { status: 400 },
            );
          }
          if (mirroredVid.length > KIE_SEEDANCE2_MAX_REF_VIDEOS) {
            return NextResponse.json(
              {
                error: `Kie Seedance allows at most ${KIE_SEEDANCE2_MAX_REF_VIDEOS} reference videos (you sent ${mirroredVid.length}).`,
              },
              { status: 400 },
            );
          }
          if (mirroredAud.length > KIE_SEEDANCE2_MAX_REF_AUDIOS) {
            return NextResponse.json(
              {
                error: `Kie Seedance allows at most ${KIE_SEEDANCE2_MAX_REF_AUDIOS} reference audio files (you sent ${mirroredAud.length}).`,
              },
              { status: 400 },
            );
          }
          if (mirroredImg.length) kieInput.reference_image_urls = mirroredImg;
          if (mirroredVid.length) kieInput.reference_video_urls = mirroredVid;
          if (mirroredAud.length) kieInput.reference_audio_urls = mirroredAud;
        } else if (
          hasKieReferenceImage &&
          hasKieEndImage &&
          klingElementsForJob.length === 0 &&
          !useCompactSeedancePreviewRefs
        ) {
          kieInput.first_frame_url = await mirrorImageUrlForPiapiSeedance(imageUrlRaw, user.id);
          kieInput.last_frame_url = await mirrorImageUrlForPiapiSeedance(endImageUrlRaw, user.id);
        } else {
          let ordered: string[] = [];
          if (useCompactSeedancePreviewRefs) {
            const compactUrls = compactNorm.urls.slice(0, SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS);
            if (klingElementsForJob.length > 0) {
              ordered = buildSeedanceOrderedReferenceUrls(
                compactUrls[0]!,
                undefined,
                klingElementsForJob,
                maxImages,
              );
              for (let i = 1; i < compactUrls.length; i++) {
                pushUniqueMediaUrl(ordered, compactUrls[i]!, maxImages);
              }
            } else {
              ordered = compactUrls;
            }
          } else if (klingElementsForJob.length > 0 || hasKieEndImage) {
            if (!hasKieReferenceImage && !useCompactSeedancePreviewRefs) {
              return NextResponse.json(
                { error: "Seedance requires `imageUrl` when using an end frame or reference elements." },
                { status: 400 },
              );
            }
            if (hasKieReferenceImage) {
              ordered = buildSeedanceOrderedReferenceUrls(
                imageUrlRaw,
                hasKieEndImage ? endImageUrlRaw : undefined,
                klingElementsForJob,
                maxImages,
              );
            }
          } else if (hasKieReferenceImage) {
            ordered = [imageUrlRaw];
          }

          if (ordered.length > maxImages) {
            return NextResponse.json(
              {
                error: `Too many Seedance references (${ordered.length}). Maximum is ${maxImages} for this model.`,
              },
              { status: 400 },
            );
          }

          if (ordered.length > 0) {
            const { imgs, vids, auds } = partitionSeedanceReferenceUrls(ordered);
            if (imgs.length > KIE_SEEDANCE2_MAX_REF_IMAGES) {
              return NextResponse.json(
                {
                  error: `Kie Seedance allows at most ${KIE_SEEDANCE2_MAX_REF_IMAGES} reference images (flattened list has ${imgs.length}).`,
                },
                { status: 400 },
              );
            }
            if (vids.length > KIE_SEEDANCE2_MAX_REF_VIDEOS || auds.length > KIE_SEEDANCE2_MAX_REF_AUDIOS) {
              return NextResponse.json(
                {
                  error: `Kie Seedance allows at most ${KIE_SEEDANCE2_MAX_REF_VIDEOS} reference videos and ${KIE_SEEDANCE2_MAX_REF_AUDIOS} audio files for references.`,
                },
                { status: 400 },
              );
            }
            const mirroredImg: string[] = [];
            const mirroredVid: string[] = [];
            const mirroredAud: string[] = [];
            for (const u of imgs) {
              mirroredImg.push(await mirrorImageUrlForPiapiSeedance(u, user.id));
            }
            for (const u of vids) {
              mirroredVid.push(await mirrorVideoUrlForPiapiSeedance(u, user.id));
            }
            for (const u of auds) {
              mirroredAud.push(await mirrorAudioUrlForPiapiSeedance(u, user.id));
            }
            if (mirroredImg.length) kieInput.reference_image_urls = mirroredImg;
            if (mirroredVid.length) kieInput.reference_video_urls = mirroredVid;
            if (mirroredAud.length) kieInput.reference_audio_urls = mirroredAud;
          } else if (hasKieReferenceImage) {
            kieInput.first_frame_url = await mirrorImageUrlForPiapiSeedance(imageUrlRaw, user.id);
          }
        }
      } catch (mirrorErr) {
        logGenerationFailure("kling/generate/mirror-seedance-kie", mirrorErr, {
          model,
        });
        return NextResponse.json(
          {
            error:
              mirrorErr instanceof Error
                ? mirrorErr.message
                : "Could not prepare reference media for the video provider.",
          },
          { status: 502 },
        );
      }

      const taskId = await kieMarketCreateTask({ model: rawModel, input: kieInput }, personalKey);
      return NextResponse.json({
        taskId,
        provider: "kie-market",
        model,
      });
    } else {
      return NextResponse.json(
        { error: `Unsupported marketModel: ${model}` },
        { status: 400 },
      );
    }

    const taskId = await kieMarketCreateTask({ model, input }, personalKey);

    return NextResponse.json({
      taskId,
      provider: "kie-market",
      model,
    });
  } catch (err) {
    logGenerationFailure("kling/generate", err, { model });
    const message = err instanceof Error ? err.message : "Unknown error.";
    const userFacing = userFacingProviderErrorOrDefault(message);
    const isGenericInvalid = /invalid parameters or inputs/i.test(userFacing);
    if (rawModel.startsWith("bytedance/seedance") && isGenericInvalid) {
      const promptTrimmed = normalizeSeedanceGeneratePrompt(prompt);
      const imageMentionMax = maxPromptMediaMention(promptTrimmed, "image");
      const videoMentionMax = maxPromptMediaMention(promptTrimmed, "video");
      const audioMentionMax = maxPromptMediaMention(promptTrimmed, "audio");
      const messageLc = message.toLowerCase();
      const looksFacePolicy =
        /only ai faces|no real faces|face input not allowed|anti-deepfake|deepfake policy|real faces? (are|is) not allowed|face policy/i.test(
          messageLc,
        );
      const seedanceFacePolicyHint = looksFacePolicy
        ? "AI face references might sometimes be rejected due to face-policy tightening. Try with a different AI-generated reference image (or a different pose/angle), then retry. If it still fails, switch to another model."
        : "";
      const seedancePromptCap = SEEDANCE_PRO_PROMPT_MAX_CHARS;
      const seedanceDebug =
        `Seedance debug: model=${rawModel}, promptChars=${promptTrimmed.length}, ` +
        `mentions(image/video/audio)=${imageMentionMax}/${videoMentionMax}/${audioMentionMax}, ` +
        `startImage=${hasKieReferenceImage ? "yes" : "no"}, endImage=${hasKieEndImage ? "yes" : "no"}, ` +
        `compactRefs=${compactNorm.urls.length}, omniRefs=${omniNorm.items.length}, ` +
        `elements=${elementsNorm.ok ? klingElementsForJob.length : 0}.`;
      logGenerationFailure("kling/generate/seedance-invalid-params", new Error(seedanceDebug), {
        model: rawModel,
        userFacing,
      });
      const promptLikelyTooLong = promptTrimmed.length > seedancePromptCap;
      const lengthHint = promptLikelyTooLong
        ? `Your prompt is about ${promptTrimmed.length} characters; Seedance allows roughly ${seedancePromptCap.toLocaleString("en-US")} characters including the instructions we add. Shorten your description and try again.`
        : "If it keeps failing, try fewer @image references, different reference images, or a different duration.";
      const errorText = [seedanceFacePolicyHint.trim(), userFacing, lengthHint].filter(Boolean).join(" ");
      return NextResponse.json({ error: errorText }, { status: 502 });
    }
    return NextResponse.json({ error: userFacing }, { status: 502 });
  }
}
