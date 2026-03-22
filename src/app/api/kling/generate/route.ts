export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import {
  canUseStudioVideoModel,
  parseAccountPlan,
  studioVideoUpgradeMessage,
} from "@/lib/subscriptionModelAccess";

type KlingAspectRatio = "16:9" | "9:16" | "1:1";
type KlingMode = "std" | "pro";

type Body = {
  /** Client plan (demo: localStorage). When set, premium models are rejected for lower tiers. */
  accountPlan?: string;
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
  personalApiKey?: string;
};

function validateDurationForModel(model: string, duration: number | undefined) {
  if (duration == null) return;
  if (model === "kling-3.0/video") {
    if (duration < 3 || duration > 15) {
      throw new Error("Invalid duration for Kling 3.0. Must be between 3 and 15.");
    }
    return;
  }
  if (model === "kling-2.6/video") {
    if (duration !== 5 && duration !== 10) {
      throw new Error("Invalid duration for Kling 2.6. Must be 5 or 10.");
    }
    return;
  }
  if (model === "openai/sora-2") {
    if (duration !== 10 && duration !== 15) {
      throw new Error("Invalid duration for Sora 2. Must be 10 or 15.");
    }
    return;
  }
  if (model === "bytedance/seedance-1.5-pro") {
    if (duration !== 4 && duration !== 8 && duration !== 12) {
      throw new Error("Invalid duration for Seedance 1.5 Pro. Must be 4, 8, or 12.");
    }
    return;
  }
  if (model.startsWith("bytedance/seedance-2")) {
    if (duration < 4 || duration > 15) {
      throw new Error("Invalid duration for Seedance 2.0. Must be between 4 and 15.");
    }
    return;
  }
  if (duration < 3 || duration > 30) {
    throw new Error("Invalid duration. Must be between 3 and 30.");
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const model = (body.marketModel ?? "kling-3.0/video").trim() || "kling-3.0/video";
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing `prompt`." }, { status: 400 });
  }

  if (body.accountPlan != null && String(body.accountPlan).trim() !== "") {
    const accountPlan = parseAccountPlan(body.accountPlan);
    if (!canUseStudioVideoModel(accountPlan, model)) {
      return NextResponse.json(
        {
          error: studioVideoUpgradeMessage(accountPlan, model) ?? "Subscription upgrade required for this model.",
          code: "PLAN_UPGRADE_REQUIRED",
        },
        { status: 403 },
      );
    }
  }

  const imageUrl = (body.imageUrl ?? "").trim();
  const mode = body.mode ?? "pro";
  try {
    validateDurationForModel(model, body.duration);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid duration." },
      { status: 400 },
    );
  }

  try {
    let input: any;
    if (model === "kling-3.0/video") {
      input = {
        prompt,
        sound: body.sound ?? true,
        duration: String(body.duration ?? 5),
        mode,
        multi_shots: Boolean(body.multiShots),
        multi_prompt: [],
      };

      if (imageUrl) {
        input.image_urls = [imageUrl];
        // KIE docs: when first-frame image is provided, aspect_ratio is invalid.
        // Safer: omit it to avoid server-side errors.
      } else {
        if (body.aspectRatio) input.aspect_ratio = body.aspectRatio;
      }
    } else if (model === "kling-2.6/video") {
      input = {
        prompt,
        sound: body.sound ?? false,
        duration: String(body.duration ?? 5),
        mode,
      };
      if (imageUrl) {
        input.image_urls = [imageUrl];
      } else if (body.aspectRatio) {
        input.aspect_ratio = body.aspectRatio;
      }
    } else if (model === "openai/sora-2") {
      input = {
        prompt,
        duration: String(body.duration ?? 10),
      };
      if (imageUrl) {
        input.image_urls = [imageUrl];
      }
    } else if (model.startsWith("bytedance/seedance")) {
      if (!imageUrl) {
        return NextResponse.json(
          { error: "Seedance requires `imageUrl` (image-to-video)." },
          { status: 400 },
        );
      }
      input = {
        prompt,
        input_urls: [imageUrl],
        aspect_ratio: body.aspectRatio ?? "9:16",
        duration: String(body.duration ?? (model === "bytedance/seedance-1.5-pro" ? 8 : 8)),
        // docs for seedance-1.5-pro uses generate_audio
        generate_audio: body.sound ?? true,
      };
    } else {
      return NextResponse.json(
        { error: `Unsupported marketModel: ${model}` },
        { status: 400 },
      );
    }

    const personalKey = typeof body.personalApiKey === "string" && body.personalApiKey.trim().length > 0
      ? body.personalApiKey.trim()
      : undefined;
    const taskId = await kieMarketCreateTask(
      { model, input },
      personalKey,
    );

    return NextResponse.json({
      taskId,
      provider: "kie-market",
      model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

