export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import {
  canUseStudioVideoEditPicker,
  parseAccountPlan,
  studioVideoEditUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import {
  isStudioVideoEditPickerId,
  resolveKieModelForEditPicker,
  studioVideoEditRouteKind,
} from "@/lib/studioVideoEditModels";

type Body = {
  accountPlan?: string;
  /** Studio picker id (`studio-edit/…`), not the raw Kie string. */
  editPickerId: string;
  prompt: string;
  /** HTTPS URL of the clip to edit (after upload). */
  videoUrl: string;
  /** Optional reference images / elements (up to 4 URLs). */
  imageUrls?: string[];
  /** `std` | `pro` — ignored when `autoSettings` is true (non-motion). */
  quality?: string;
  /** When true, use Pro mode for Kie edit models that support `mode`. */
  autoSettings?: boolean;
  /** O1-style APIs: preserve source audio when supported. */
  keepAudio?: boolean;
};

function modeFromQuality(q: string | undefined, auto: boolean | undefined): "std" | "pro" {
  if (auto) return "pro";
  const s = (q ?? "std").toLowerCase();
  return s === "pro" || s === "1080p" ? "pro" : "std";
}

function buildInputForPicker(
  pickerId: string,
  opts: {
    prompt: string;
    videoUrl: string;
    imageUrls: string[];
    mode: "std" | "pro";
    keepAudio: boolean;
  },
): Record<string, unknown> {
  const urls = opts.imageUrls.filter((u) => typeof u === "string" && u.trim().length > 0).slice(0, 4);

  switch (pickerId) {
    case "studio-edit/kling-o1": {
      const input: Record<string, unknown> = {
        prompt: opts.prompt,
        video_url: opts.videoUrl,
        keep_audio: opts.keepAudio,
      };
      if (urls.length) input.image_urls = urls;
      return input;
    }
    case "studio-edit/kling-omni":
      return {
        prompt: opts.prompt,
        video_urls: [opts.videoUrl],
        mode: opts.mode,
      };
    case "studio-edit/grok": {
      const input: Record<string, unknown> = {
        prompt: opts.prompt,
        video_url: opts.videoUrl,
        mode: opts.mode,
      };
      return input;
    }
    default:
      throw new Error(`Unsupported editPickerId: ${pickerId}`);
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const pickerId = (body.editPickerId ?? "").trim();
  if (!isStudioVideoEditPickerId(pickerId)) {
    return NextResponse.json({ error: "Invalid or missing `editPickerId`." }, { status: 400 });
  }
  if (studioVideoEditRouteKind(pickerId) !== "kie_edit") {
    return NextResponse.json(
      { error: "This picker uses Motion Control — call `/api/kling/motion-control` instead." },
      { status: 400 },
    );
  }

  const prompt = (body.prompt ?? "").trim();
  const videoUrl = (body.videoUrl ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing `prompt`." }, { status: 400 });
  }
  if (!videoUrl) {
    return NextResponse.json({ error: "Missing `videoUrl`." }, { status: 400 });
  }

  if (body.accountPlan != null && String(body.accountPlan).trim() !== "") {
    const accountPlan = parseAccountPlan(body.accountPlan);
    if (!canUseStudioVideoEditPicker(accountPlan, pickerId)) {
      return NextResponse.json(
        {
          error:
            studioVideoEditUpgradeMessage(accountPlan, pickerId) ??
            "Subscription upgrade required for this model.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }

  const kieModel = resolveKieModelForEditPicker(pickerId);
  if (!kieModel) {
    return NextResponse.json({ error: "Could not resolve Kie model for this picker." }, { status: 500 });
  }

  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
  const mode = modeFromQuality(body.quality, body.autoSettings);
  const keepAudio = body.keepAudio !== false;

  try {
    const input = buildInputForPicker(pickerId, {
      prompt,
      videoUrl,
      imageUrls,
      mode,
      keepAudio,
    });

    const taskId = await kieMarketCreateTask({
      model: kieModel,
      input,
    });

    return NextResponse.json({
      taskId,
      provider: "kie-market",
      model: kieModel,
      editPickerId: pickerId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
