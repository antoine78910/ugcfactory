export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { mirrorImageUrlForPiapiSeedance } from "@/lib/mirrorImageUrlForPiapi";
import { resolveKieVideoPickerToMarketModel } from "@/lib/kieVideoModelResolver";
import { encodePiapiTaskId, piapiCreateSeedanceTask, type PiapiSeedanceTaskType } from "@/lib/piapiSeedance";
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
import { validateStudioVideoJobDuration } from "@/lib/studioVideoModelCapabilities";

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
  duration?: number; // seconds
  aspectRatio?: KlingAspectRatio; // optional if image is provided
  sound?: boolean;
  mode?: KlingMode;
  /** Kling 3.0 only — multi-shot sequencing */
  multiShots?: boolean;
  /** Kling 3.0 only — when `multiShots` is true, each shot prompt + duration (seconds). */
  multiPrompt?: KlingMultiPromptShot[];
  /** Kling 3.0 only — `@name` references in prompts; max 3 elements, 2–4 image URLs each. */
  klingElements?: KlingElementInput[];
  personalApiKey?: string;
  piapiApiKey?: string;
};

/** Per-shot length — Kling 3.0 Market API: integer 1–12 seconds each. @see https://docs.kie.ai/market/kling/kling-3-0 */
const KLING_SHOT_DURATION_MIN = 1;
const KLING_SHOT_DURATION_MAX = 12;
const KLING_MULTI_MAX_SHOTS = 5;
const KLING_ELEMENT_MAX = 3;

/** Total clip length — Kling 3.0 `input.duration` string enum 3…15 must equal sum of `multi_prompt` durations. */
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
): { ok: true; elements: KlingElementInput[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, elements: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "`klingElements` must be an array." };
  if (raw.length > KLING_ELEMENT_MAX) {
    return { ok: false, error: `At most ${KLING_ELEMENT_MAX} Kling elements are allowed.` };
  }
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
    if (urls.length < 2 || urls.length > 4) {
      return {
        ok: false,
        error: `Element "${name}": provide between 2 and 4 reference image URLs.`,
      };
    }
    elements.push({ name, description: desc, element_input_urls: urls });
  }
  return { ok: true, elements };
}

function isKling26(model: string): boolean {
  return (
    model === "kling-2.6/video" ||
    model === "kling-2.6/image-to-video" ||
    model === "kling-2.6/text-to-video"
  );
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
  const hasKieReferenceImage = isKieServableReferenceImageUrl(imageUrlRaw);
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
  const elementsNorm = kling30Multi ? normalizeKlingElements(body.klingElements) : { ok: true as const, elements: [] };
  if (!elementsNorm.ok) {
    return NextResponse.json({ error: elementsNorm.error }, { status: 400 });
  }

  if (kling30Multi && elementsNorm.elements.length > 0 && !hasKieReferenceImage) {
    return NextResponse.json(
      {
        error:
          "Kling 3.0 requires a start frame (`imageUrl`) when using element references (`kling_elements` / @name in prompts).",
      },
      { status: 400 },
    );
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
      }

      if (hasKieReferenceImage) {
        // Kling 3.0 multi-shot: first frame only (same as single-frame I2V).
        input.image_urls = [imageUrlRaw];
      } else if (body.aspectRatio) {
        input.aspect_ratio = body.aspectRatio;
      }
    } else if (isKling26(model)) {
      input = {
        prompt,
        sound: body.sound ?? false,
        duration: String(body.duration ?? 5),
      };
      if (hasKieReferenceImage) {
        input.image_urls = [imageUrlRaw];
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
      if (preview && !hasKieReferenceImage) {
        return NextResponse.json(
          { error: "This Seedance preview model requires `imageUrl` (image-to-video)." },
          { status: 400 },
        );
      }
      const duration = Number(body.duration ?? 10);
      const seedanceAspectRatio =
        body.aspectRatio === "1:1" ? ("4:3" as const) : (body.aspectRatio ?? "9:16");
      let piapiImageUrl: string | undefined;
      if (hasKieReferenceImage) {
        try {
          piapiImageUrl = await mirrorImageUrlForPiapiSeedance(imageUrlRaw, user.id);
        } catch (mirrorErr) {
          logGenerationFailure("kling/generate/mirror-seedance-image", mirrorErr, {
            model,
            imageHost: (() => {
              try {
                return new URL(imageUrlRaw).hostname;
              } catch {
                return "invalid";
              }
            })(),
          });
          return NextResponse.json(
            {
              error:
                mirrorErr instanceof Error
                  ? mirrorErr.message
                  : "Could not prepare the reference image for the video provider.",
            },
            { status: 502 },
          );
        }
      }
      const rawTaskId = await piapiCreateSeedanceTask({
        taskType,
        prompt,
        imageUrl: piapiImageUrl,
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
    return NextResponse.json({ error: userFacingProviderErrorOrDefault(message) }, { status: 502 });
  }
}
