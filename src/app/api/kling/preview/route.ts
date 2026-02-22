export const runtime = "nodejs";

import { NextResponse } from "next/server";
type KlingAspectRatio = "16:9" | "9:16" | "1:1";
type KlingMode = "std" | "pro";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        prompt?: string;
        imageUrl?: string;
        duration?: number;
        aspectRatio?: KlingAspectRatio;
        sound?: boolean;
        mode?: KlingMode;
      }
    | null;

  const imageUrl = (body?.imageUrl ?? "").trim();
  const mode = body?.mode ?? "pro";

  return NextResponse.json({
    provider: "kie-market",
    model: "kling-3.0/video",
    taskMode: imageUrl ? "image-to-video" : "text-to-video",
    duration: body?.duration ?? 5,
    aspect_ratio: body?.aspectRatio ?? "16:9",
    sound: body?.sound ?? true,
    input: {
      prompt: body?.prompt ?? "",
      image_urls: imageUrl ? [imageUrl] : undefined,
      sound: body?.sound ?? true,
      duration: String(body?.duration ?? 5),
      aspect_ratio: imageUrl ? undefined : body?.aspectRatio,
      mode,
      multi_shots: false,
      multi_prompt: [],
    },
  });
}

