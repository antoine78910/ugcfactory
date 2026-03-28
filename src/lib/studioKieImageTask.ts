import { getAppUrl, getEnv } from "@/lib/env";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { normalizeKieNanoBananaImageInputUrls } from "@/lib/kieNanoBananaImageInputUrls";
import {
  buildKieGoogleImageInput,
  kieMarketModelForStudioImage,
  type KieGoogleImageResolution,
} from "@/lib/kieGoogleImage";
import type { NanoBananaImageSize, NanoBananaProAspectRatio, NanoBananaProResolution } from "@/lib/nanobanana";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";

export type StudioKieImageTaskInput = {
  prompt: string;
  model?: "nano" | "pro";
  imageUrl?: string;
  imageUrls?: string[];
  imageSize?: NanoBananaImageSize;
  numImages?: number;
  resolution?: NanoBananaProResolution;
  aspectRatio?: NanoBananaProAspectRatio;
  personalApiKey?: string;
};

export function clampStudioNumImages(n: unknown): number {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return 1;
  return Math.min(4, Math.max(1, x));
}

/**
 * Creates one or more Kie Market image tasks (Nano Banana 2 / Pro). Used by /api/nanobanana/generate and studio job start.
 */
export async function createStudioKieImageTasks(input: StudioKieImageTaskInput): Promise<{
  taskId?: string;
  taskIds?: string[];
  model: "nano" | "pro";
  kieModel: string;
}> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Missing prompt.");

  const callBackUrl =
    getEnv("NANOBANANA_CALLBACK_URL") ?? `${getAppUrl()}/api/nanobanana/callback`;

  const normalizedImageUrls = Array.isArray(input.imageUrls)
    ? input.imageUrls.filter((u) => typeof u === "string" && u.trim().length > 0)
    : input.imageUrl
      ? [input.imageUrl]
      : [];

  const imageUrlsRaw = normalizedImageUrls.length > 0 ? normalizedImageUrls : undefined;
  const imageUrls = await normalizeKieNanoBananaImageInputUrls(imageUrlsRaw);
  const model = input.model ?? "nano";
  const personalKey = hasPersonalApiKey(input.personalApiKey) ? input.personalApiKey!.trim() : undefined;
  const num = clampStudioNumImages(input.numImages);
  const resolutionNano = (input.resolution ?? "1K") as KieGoogleImageResolution;
  const kieModel = kieMarketModelForStudioImage(model);
  const aspectFor = input.aspectRatio ?? input.imageSize ?? "auto";

  const runOne = () =>
    kieMarketCreateTask(
      {
        model: kieModel,
        callBackUrl,
        input: buildKieGoogleImageInput({
          prompt,
          aspectRatio: typeof aspectFor === "string" ? aspectFor : "auto",
          resolution: resolutionNano,
          imageUrls,
        }),
      },
      personalKey,
    );

  if (num <= 1) {
    const taskId = await runOne();
    return { taskId, model, kieModel };
  }
  const taskIds = await Promise.all(Array.from({ length: num }, () => runOne()));
  return { taskIds, model, kieModel };
}
