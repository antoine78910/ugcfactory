import { getAppUrl, getEnv } from "@/lib/env";
import { kieMarketCreateTask } from "@/lib/kieMarket";
import { normalizeKieNanoBananaImageInputUrls } from "@/lib/kieNanoBananaImageInputUrls";
import {
  buildKieGoogleImageInput,
  kieMarketModelForStudioImage,
  type KieGoogleImageResolution,
} from "@/lib/kieGoogleImage";
import { buildKieGptImage2Input, kieMarketModelForGptImage2Picker } from "@/lib/kieGptImage2";
import {
  buildKieSeedreamInput,
  kieMarketModelForSeedreamPicker,
} from "@/lib/kieSeedreamImage";
import type { NanoBananaImageSize, NanoBananaProAspectRatio, NanoBananaProResolution } from "@/lib/nanobanana";
import { hasPersonalApiKey } from "@/lib/personalApiBypass";
import {
  isStudioGptImage2ResolvedPickerId,
  isStudioSeedreamImagePickerId,
  resolveStudioImageModelForReferences,
  studioGptImage2PickerRequiresReferenceImages,
  studioSeedreamPickerRequiresReferenceImages,
  type StudioImageKiePickerModelId,
} from "@/lib/studioImageModels";

export type StudioKieImageTaskInput = {
  prompt: string;
  model?: StudioImageKiePickerModelId;
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
  model: StudioImageKiePickerModelId;
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
  const requestedModel = input.model ?? "nano";
  const model = resolveStudioImageModelForReferences(requestedModel, Boolean(imageUrlsRaw?.length));
  const personalKey = hasPersonalApiKey(input.personalApiKey) ? input.personalApiKey!.trim() : undefined;
  const num = clampStudioNumImages(input.numImages);
  const resolution = (input.resolution ?? "1K") as "1K" | "2K" | "4K";

  if (isStudioSeedreamImagePickerId(model)) {
    const normalizedRefs = await normalizeKieNanoBananaImageInputUrls(imageUrlsRaw);
    if (studioSeedreamPickerRequiresReferenceImages(model)) {
      if (!normalizedRefs?.length) {
        throw new Error("Add at least one reference image for this Seedream image-to-image model.");
      }
    }
    const kieModel = kieMarketModelForSeedreamPicker(model);
    const aspectFor = input.aspectRatio ?? input.imageSize ?? "auto";
    const seedInput = buildKieSeedreamInput({
      pickerId: model,
      prompt,
      aspectRatio: typeof aspectFor === "string" ? aspectFor : "auto",
      resolution,
      imageUrls: normalizedRefs,
    });

    const runSeedream = () =>
      kieMarketCreateTask(
        {
          model: kieModel,
          callBackUrl,
          input: seedInput,
        },
        personalKey,
      );

    if (num <= 1) {
      const taskId = await runSeedream();
      return { taskId, model, kieModel };
    }
    const taskIds = await Promise.all(Array.from({ length: num }, () => runSeedream()));
    return { taskIds, model, kieModel };
  }

  if (isStudioGptImage2ResolvedPickerId(model)) {
    const normalizedRefs = await normalizeKieNanoBananaImageInputUrls(imageUrlsRaw);
    if (studioGptImage2PickerRequiresReferenceImages(model)) {
      if (!normalizedRefs?.length) {
        throw new Error("Add at least one reference image for GPT Image 2 image-to-image.");
      }
    }
    const kieModel = kieMarketModelForGptImage2Picker(model);
    const aspectFor = input.aspectRatio ?? input.imageSize ?? "auto";
    const cappedRefs =
      model === "gpt_image_2_image_to_image" ? normalizedRefs?.slice(0, 16) : undefined;
    const gptInput = buildKieGptImage2Input({
      pickerId: model,
      prompt,
      aspectRatio: typeof aspectFor === "string" ? aspectFor : "auto",
      imageUrls: cappedRefs,
    });

    const runGpt = () =>
      kieMarketCreateTask(
        {
          model: kieModel,
          callBackUrl,
          input: gptInput,
        },
        personalKey,
      );

    if (num <= 1) {
      const taskId = await runGpt();
      return { taskId, model, kieModel };
    }
    const taskIds = await Promise.all(Array.from({ length: num }, () => runGpt()));
    return { taskIds, model, kieModel };
  }

  const imageUrls = await normalizeKieNanoBananaImageInputUrls(imageUrlsRaw);
  const resolutionNano = resolution as KieGoogleImageResolution;
  const googleModel = model === "pro" ? "pro" : "nano";
  const kieModel = kieMarketModelForStudioImage(googleModel);
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
