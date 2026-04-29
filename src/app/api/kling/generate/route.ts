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
  encodePiapiTaskId,
  piapiCreateSeedanceTask,
  SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS,
  SEEDANCE_PREVIEW_MAX_IMAGE_URLS,
  SEEDANCE_PRO_MAX_IMAGE_URLS,
  SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS,
  type PiapiSeedanceAspectRatio,
  type PiapiSeedanceTaskType,
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
   * Prompt uses `@imageN` / `@videoN` / `@audioN` (tags may be auto-prefixed). Max 12 refs (Pro) / 9 (Preview) total; Preview elements are images only.
   */
  klingElements?: KlingElementInput[];
  /**
   * Seedance 2 Preview / Fast Preview (+ VIP variants): 1–4 HTTPS image URLs only.
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
};

/** Per-shot length, Kling 3.0 Market API: integer 1–12 seconds each. @see https://docs.kie.ai/market/kling/kling-3-0 */
const KLING_SHOT_DURATION_MIN = 1;
const KLING_SHOT_DURATION_MAX = 12;
const KLING_MULTI_MAX_SHOTS = 5;
const KLING_ELEMENT_MAX = 3;

/** Total clip length, Kling 3.0 `input.duration` string enum 3…15 must equal sum of `multi_prompt` durations. */
const KLING_TOTAL_DURATION_MIN = 3;
const KLING_TOTAL_DURATION_MAX = 15;

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

function isSeedanceCompactPreviewMarketModel(raw: string): boolean {
  return (
    raw === "bytedance/seedance-2-preview" ||
    raw === "bytedance/seedance-2-fast-preview" ||
    raw === "bytedance/seedance-2-preview-vip" ||
    raw === "bytedance/seedance-2-fast-preview-vip"
  );
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
      error: `At most ${SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS} images are allowed for Seedance Preview compact upload.`,
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

  const rawModel = (body.marketModel ?? "kling-3.0/video").trim() || "kling-3.0/video";
  const imageUrlRaw = (body.imageUrl ?? "").trim();
  const endImageUrlRaw = (body.endImageUrl ?? "").trim();
  const hasKieReferenceImage = isKieServableReferenceImageUrl(imageUrlRaw);
  const hasKieEndImage = isKieServableReferenceImageUrl(endImageUrlRaw);
  const compactNorm = normalizeSeedanceCompactPreviewUrls(body);
  if (!compactNorm.ok) {
    return NextResponse.json({ error: compactNorm.error }, { status: 400 });
  }
  if (compactNorm.urls.length > 0 && !isSeedanceCompactPreviewMarketModel(rawModel)) {
    return NextResponse.json(
      { error: "`seedancePreviewImageUrls` is only valid for Seedance Preview or Fast Preview models." },
      { status: 400 },
    );
  }
  const useCompactSeedancePreviewRefs =
    isSeedanceCompactPreviewMarketModel(rawModel) && compactNorm.urls.length > 0;

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

  if (model === "kling-3.0/video" && elementsNorm.elements.length > 0 && !hasKieReferenceImage) {
    return NextResponse.json(
      {
        error:
          "Kling 3.0 requires a start frame (`imageUrl`) when using element references (`kling_elements` / @name in prompts).",
      },
      { status: 400 },
    );
  }

  if (rawModel.startsWith("bytedance/seedance") && elementsNorm.elements.length > 0) {
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
        if (elementsNorm.elements.length) {
          input.kling_elements = elementsNorm.elements.map((el) => ({
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
        if (elementsNorm.elements.length) {
          input.kling_elements = elementsNorm.elements.map((el) => ({
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
      const SEEDANCE_TASK: Record<string, PiapiSeedanceTaskType> = {
        "bytedance/seedance-2": "seedance-2",
        "bytedance/seedance-2-fast": "seedance-2-fast",
        "bytedance/seedance-2-preview": "seedance-2-preview",
        "bytedance/seedance-2-fast-preview": "seedance-2-fast-preview",
        "bytedance/seedance-2-preview-vip": "seedance-2-preview-vip",
        "bytedance/seedance-2-fast-preview-vip": "seedance-2-fast-preview-vip",
      };
      const taskType = SEEDANCE_TASK[rawModel];
      if (!taskType) {
        return NextResponse.json({ error: `Unsupported Seedance model: ${rawModel}` }, { status: 400 });
      }
      const preview =
        taskType === "seedance-2-preview" ||
        taskType === "seedance-2-fast-preview" ||
        taskType === "seedance-2-preview-vip" ||
        taskType === "seedance-2-fast-preview-vip";
      if (preview && !hasKieReferenceImage && !useCompactSeedancePreviewRefs) {
        return NextResponse.json(
          { error: "This Seedance preview model requires `imageUrl` (image-to-video) or `seedancePreviewImageUrls`." },
          { status: 400 },
        );
      }
      if (hasKieEndImage && !hasKieReferenceImage && !useCompactSeedancePreviewRefs) {
        return NextResponse.json(
          { error: "Provide `imageUrl` (start frame) when using `endImageUrl` on Seedance." },
          { status: 400 },
        );
      }
      const duration = Number(body.duration ?? 10);
      const maxImages = preview ? SEEDANCE_PREVIEW_MAX_IMAGE_URLS : SEEDANCE_PRO_MAX_IMAGE_URLS;

      const seedanceAspectRatio: PiapiSeedanceAspectRatio =
        body.aspectRatio === "1:1" ? "4:3" : ((body.aspectRatio ?? "9:16") as PiapiSeedanceAspectRatio);

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
        if (elementsNorm.elements.length > 0) {
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
          for (const el of elementsNorm.elements) {
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
        try {
          for (const u of imagesToMirror) {
            mirroredImg.push(await mirrorImageUrlForPiapiSeedance(u, user.id));
          }
          for (const u of videosToMirror) {
            mirroredVid.push(await mirrorVideoUrlForPiapiSeedance(u, user.id));
          }
          for (const u of audiosToMirror) {
            mirroredAud.push(await mirrorAudioUrlForPiapiSeedance(u, user.id));
          }
        } catch (mirrorErr) {
          logGenerationFailure("kling/generate/mirror-seedance-omni", mirrorErr, {
            model,
            count: items.length,
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
        const rawTaskId = await piapiCreateSeedanceTask({
          taskType,
          prompt,
          imageUrls: mirroredImg.length ? mirroredImg : undefined,
          videoUrls: mirroredVid.length ? mirroredVid : undefined,
          audioUrls: mirroredAud.length ? mirroredAud : undefined,
          preferOmniReference: true,
          forceOmniReference: elementsNorm.elements.length > 0,
          duration,
          aspectRatio: seedanceAspectRatio,
          overrideApiKey: piapiKey,
        });
        return NextResponse.json({
          taskId: encodePiapiTaskId(rawTaskId),
          provider: "piapi",
          model,
        });
      }

      let ordered: string[] = [];
      if (useCompactSeedancePreviewRefs) {
        const compactUrls = compactNorm.urls.slice(0, SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS);
        if (elementsNorm.elements.length > 0) {
          ordered = buildSeedanceOrderedReferenceUrls(
            compactUrls[0]!,
            undefined,
            elementsNorm.elements,
            maxImages,
          );
          for (let i = 1; i < compactUrls.length; i++) {
            pushUniqueMediaUrl(ordered, compactUrls[i]!, maxImages);
          }
        } else {
          ordered = compactUrls;
        }
      } else if (elementsNorm.elements.length > 0 || hasKieEndImage) {
        if (!hasKieReferenceImage) {
          return NextResponse.json(
            { error: "Seedance requires `imageUrl` when using an end frame or reference elements." },
            { status: 400 },
          );
        }
        ordered = buildSeedanceOrderedReferenceUrls(
          imageUrlRaw,
          hasKieEndImage ? endImageUrlRaw : undefined,
          elementsNorm.elements,
          maxImages,
        );
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

      if (preview && elementsNorm.elements.length > 0) {
        for (const u of ordered) {
          if (inferSeedanceReferenceKindFromUrl(u) !== "image") {
            return NextResponse.json(
              {
                error:
                  "Seedance Preview does not support video or audio in element references. Use images only, or switch to Seedance 2 / Fast.",
              },
              { status: 400 },
            );
          }
        }
      }

      const { imgs, vids, auds } = partitionSeedanceReferenceUrls(ordered);

      const mirroredImg: string[] = [];
      const mirroredVid: string[] = [];
      const mirroredAud: string[] = [];
      try {
        for (const u of imgs) {
          mirroredImg.push(await mirrorImageUrlForPiapiSeedance(u, user.id));
        }
        for (const u of vids) {
          mirroredVid.push(await mirrorVideoUrlForPiapiSeedance(u, user.id));
        }
        for (const u of auds) {
          mirroredAud.push(await mirrorAudioUrlForPiapiSeedance(u, user.id));
        }
      } catch (mirrorErr) {
        logGenerationFailure("kling/generate/mirror-seedance-images", mirrorErr, {
          model,
          count: ordered.length,
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

      const rawTaskId = await piapiCreateSeedanceTask({
        taskType,
        prompt,
        imageUrls: mirroredImg.length ? mirroredImg : undefined,
        videoUrls: mirroredVid.length ? mirroredVid : undefined,
        audioUrls: mirroredAud.length ? mirroredAud : undefined,
        preferOmniReference: mirroredVid.length > 0 || mirroredAud.length > 0,
        forceOmniReference: elementsNorm.elements.length > 0,
        duration,
        aspectRatio: seedanceAspectRatio,
        overrideApiKey: piapiKey,
      });
      return NextResponse.json({
        taskId: encodePiapiTaskId(rawTaskId),
        provider: "piapi",
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
      const promptTrimmed = prompt.trim();
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
      const seedanceDebug =
        `Seedance debug: model=${rawModel}, promptChars=${promptTrimmed.length}, ` +
        `mentions(image/video/audio)=${imageMentionMax}/${videoMentionMax}/${audioMentionMax}, ` +
        `startImage=${hasKieReferenceImage ? "yes" : "no"}, endImage=${hasKieEndImage ? "yes" : "no"}, ` +
        `compactRefs=${compactNorm.urls.length}, omniRefs=${omniNorm.items.length}, ` +
        `elements=${elementsNorm.ok ? elementsNorm.elements.length : 0}.`;
      return NextResponse.json(
        {
          error: `${seedanceFacePolicyHint ? `${seedanceFacePolicyHint} ` : ""}${userFacing} ${seedanceDebug}`.trim(),
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: userFacing }, { status: 502 });
  }
}
