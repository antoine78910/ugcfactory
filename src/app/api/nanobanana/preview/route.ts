export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type {
  NanoBananaImageSize,
  NanoBananaProAspectRatio,
  NanoBananaProResolution,
} from "@/lib/nanobanana";
import { buildKieGoogleImageInput, kieMarketModelForStudioImage } from "@/lib/kieGoogleImage";

type Body = {
  model?: "nano" | "pro";
  prompt?: string;
  imageUrls?: string[];
  numImages?: number;
  imageSize?: NanoBananaImageSize;
  resolution?: NanoBananaProResolution;
  aspectRatio?: NanoBananaProAspectRatio;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const model = body?.model ?? "nano";
  const imageUrls =
    Array.isArray(body?.imageUrls) && body!.imageUrls!.length > 0
      ? body!.imageUrls!.filter((u) => typeof u === "string" && u.trim().length > 0)
      : [];

  const resolution = body?.resolution ?? "2K";
  const aspect = body?.aspectRatio ?? body?.imageSize ?? "auto";
  const kieModel = kieMarketModelForStudioImage(model);
  const input = buildKieGoogleImageInput({
    prompt: body?.prompt ?? "",
    aspectRatio: typeof aspect === "string" ? aspect : "auto",
    resolution,
    imageUrls: imageUrls.length ? imageUrls : undefined,
  });

  return NextResponse.json({
    provider: "kie-market",
    model: kieModel,
    endpoint: "/api/v1/jobs/createTask",
    input,
  });
}
