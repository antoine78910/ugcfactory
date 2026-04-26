export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText, openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { claudeMessagesText, claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import { UGC_I2V_PROMPT_INSTRUCTIONS } from "@/lib/ugcI2vPromptInstructions";
import { normalizeUgcScriptVideoDurationSec } from "@/lib/ugcAiScriptBrief";
import { parseUgcI2v30sParts } from "@/lib/ugcI2vParse";
import { LINK_TO_AD_APP_VIDEO_PROMPT_INSTRUCTIONS } from "@/lib/linkToAdAppPrompts";

type Body = {
  /** Full UGC script for the chosen angle (includes VOICE PROFILE etc.) */
  angleScript: string;
  provider?: "gpt" | "claude";
  /** Drives 30s → two prompts (PART 1 / PART 2) vs single prompt. */
  videoDurationSeconds?: number;
  linkToAdAssetType?: "product" | "app";
  /** Selected reference images from Link to Ad (chosen image + product photos fallbacks). */
  referenceImageUrls?: string[];
};

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const angleScript = body?.angleScript?.trim();
  const provider: "gpt" | "claude" = body?.provider === "gpt" ? "gpt" : "claude";
  const videoDurationSeconds = normalizeUgcScriptVideoDurationSec(body?.videoDurationSeconds);
  const linkToAdAssetType = body?.linkToAdAssetType === "app" ? "app" : "product";
  const referenceImageUrls = Array.from(
    new Set(
      (Array.isArray(body?.referenceImageUrls) ? body?.referenceImageUrls : [])
        .map((u) => String(u ?? "").trim())
        .filter((u) => /^https?:\/\//i.test(u)),
    ),
  ).slice(0, 8);
  if (!angleScript) {
    return NextResponse.json({ error: "Missing `angleScript`." }, { status: 400 });
  }

  const developer = [
    "Follow OUTPUT FORMAT in the user instructions exactly.",
    videoDurationSeconds === 30
      ? "For 30s: output PROMPT PART 1 and PROMPT PART 2 only. Each part 120–180 words, one continuous paragraph per part per OUTPUT FORMAT. No markdown headings besides those two lines. No bullet points."
      : "For 5s/10s/15s: output ONE prompt as one continuous paragraph (120–180 words) per OUTPUT FORMAT. For 10s, use the same structure as 5s/15s. No bullet points.",
    "The script and VIDEO_METADATA are the source of truth for dialogue and product behavior.",
    "Non-interactive mode: never ask for more inputs, never request image/script, never explain what you need, never add prefaces/disclaimers.",
    "Return the prompt content directly and nothing else.",
  ].join("\n");

  const user = [
    linkToAdAssetType === "app" ? LINK_TO_AD_APP_VIDEO_PROMPT_INSTRUCTIONS : UGC_I2V_PROMPT_INSTRUCTIONS,
    "",
    "---",
    `Target video duration for this run: ${String(videoDurationSeconds)} seconds.`,
    videoDurationSeconds === 30
      ? "You MUST output PROMPT PART 1 and PROMPT PART 2 (30s workflow, two 15s clips)."
      : "Output a single continuous video prompt (not PART 1 / PART 2).",
    "The reference image is already selected and available in this pipeline. Do not ask for it.",
    "Do not ask questions. Do not ask for additional inputs. Produce final prompts now.",
    referenceImageUrls.length
      ? `Reference images are attached to this request (${referenceImageUrls.length}). Analyze them now.`
      : "No image attachment could be forwarded; still produce a final prompt directly from the script metadata without asking for inputs.",
    "",
    "UGC SCRIPT FOR THIS ANGLE (includes voice profile, use it):",
    angleScript,
  ].join("\n");

  try {
    const text =
      provider === "claude"
        ? referenceImageUrls.length
          ? await claudeMessagesTextWithImages({
              system: developer,
              user,
              imageUrls: referenceImageUrls,
            })
          : await claudeMessagesText({ system: developer, user })
        : referenceImageUrls.length
          ? (
              await openaiResponsesTextWithImages({
                developer,
                userText: user,
                imageUrls: referenceImageUrls,
              })
            ).text
          : (await openaiResponsesText({ developer, user })).text;
    const data = String(text ?? "").trim();
    const parts30 = videoDurationSeconds === 30 ? parseUgcI2v30sParts(data) : null;
    return NextResponse.json({
      data,
      videoDurationSeconds,
      part1: parts30?.part1,
      part2: parts30?.part2,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
