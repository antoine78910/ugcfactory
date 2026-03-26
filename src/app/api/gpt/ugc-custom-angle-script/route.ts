export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText, openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { claudeMessagesText, claudeMessagesTextWithImages } from "@/lib/claudeResponses";

type Body = {
  brandBrief: string;
  customAngle: string;
  productImageUrls?: string[] | null;
  videoDurationSeconds?: 8 | 15 | 30;
  provider?: "gpt" | "claude";
};

function collectHttpsUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, 3);
}

function durationRules(seconds: 8 | 15 | 30) {
  if (seconds === 8) return "8 seconds total video -> MAXIMUM 16 spoken words.";
  if (seconds === 30) return "30 seconds total video -> MAXIMUM 60 spoken words.";
  return "15 seconds total video -> MAXIMUM 30 spoken words.";
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const brandBrief = body?.brandBrief?.trim();
  const customAngle = body?.customAngle?.trim();
  const provider: "gpt" | "claude" = body?.provider === "gpt" ? "gpt" : "claude";
  if (!brandBrief || !customAngle) {
    return NextResponse.json({ error: "Missing `brandBrief` or `customAngle`." }, { status: 400 });
  }

  const imageUrls = collectHttpsUrls(body?.productImageUrls);
  const videoDurationSeconds: 8 | 15 | 30 =
    body?.videoDurationSeconds === 8 || body?.videoDurationSeconds === 30
      ? body.videoDurationSeconds
      : 15;

  const developer = [
    "You are an expert UGC scriptwriter for AI video (lipsync, shot segmentation, image-to-video).",
    "The user provides a brand brief AND a specific marketing angle they want to explore.",
    "Write ONE script option following this exact structure:",
    "",
    "SCRIPT OPTION 1",
    "(VOICE PROFILE, scene context, then HOOK/PROBLEM/SOLUTION/CTA each as (gesture) \"line\")",
    "",
    "VIDEO_METADATA",
    "(persona, location, camera_style, props, actions, tone, energy_level)",
    "",
    "ANGLE_HEADLINE: (one sentence, 12-24 words summarizing the creative angle)",
    "",
    `${durationRules(videoDurationSeconds)} Count only spoken words in HOOK, PROBLEM, SOLUTION, CTA.`,
    "Output plain text only. Write in English. Keep it natural and conversational.",
  ].join("\n");

  const imageNote =
    imageUrls.length === 0
      ? "No product image attached."
      : `I am attaching ${imageUrls.length} product reference image(s).`;

  const userPayload = [
    "Create 1 UGC video script for this product, using the SPECIFIC marketing angle below.",
    "",
    `Marketing angle to explore: "${customAngle}"`,
    "",
    "Brand brief:",
    brandBrief,
    "",
    `Video length: ${videoDurationSeconds} seconds`,
    "",
    imageNote,
  ].join("\n");

  try {
    const text =
      provider === "claude"
        ? imageUrls.length > 0
          ? await claudeMessagesTextWithImages({ system: developer, user: userPayload, imageUrls })
          : await claudeMessagesText({ system: developer, user: userPayload })
        : (
            imageUrls.length > 0
              ? await openaiResponsesTextWithImages({ developer, userText: userPayload, imageUrls })
              : await openaiResponsesText({ developer, user: userPayload })
          ).text;

    return NextResponse.json({ data: text.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
