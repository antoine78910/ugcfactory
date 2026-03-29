export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText, openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { claudeMessagesText, claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import { durationRulesForUgcApi, UGC_SCRIPT_INSTRUCTIONS } from "@/lib/ugcAiScriptBrief";

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
    "Follow EVERY rule in the instructions below.",
    "The user provides a brand brief AND one specific marketing angle — output only ONE script.",
    "OVERRIDE: Generate SCRIPT OPTION 1 and its VIDEO_METADATA only. Do NOT output SCRIPT OPTION 2 or SCRIPT OPTION 3.",
    "After VIDEO_METADATA, add one line: ANGLE_HEADLINE: (12–24 words summarizing this creative angle).",
    `${durationRulesForUgcApi(videoDurationSeconds)} Count only spoken words in HOOK, PROBLEM, SOLUTION, CTA (except when the 5-second tier omits PROBLEM).`,
    "Output plain text only. Write in English.",
    "",
    UGC_SCRIPT_INSTRUCTIONS,
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
