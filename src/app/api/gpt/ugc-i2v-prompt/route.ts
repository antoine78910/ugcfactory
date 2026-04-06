export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { claudeMessagesText } from "@/lib/claudeResponses";
import { UGC_I2V_PROMPT_INSTRUCTIONS } from "@/lib/ugcI2vPromptInstructions";
import { normalizeUgcScriptVideoDurationSec } from "@/lib/ugcAiScriptBrief";
import { parseUgcI2v30sParts } from "@/lib/ugcI2vParse";

type Body = {
  /** Full UGC script for the chosen angle (includes VOICE PROFILE etc.) */
  angleScript: string;
  provider?: "gpt" | "claude";
  /** Drives 30s → two prompts (PART 1 / PART 2) vs single prompt. */
  videoDurationSeconds?: number;
};

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const angleScript = body?.angleScript?.trim();
  const provider: "gpt" | "claude" = body?.provider === "gpt" ? "gpt" : "claude";
  const videoDurationSeconds = normalizeUgcScriptVideoDurationSec(body?.videoDurationSeconds);
  if (!angleScript) {
    return NextResponse.json({ error: "Missing `angleScript`." }, { status: 400 });
  }

  const developer = [
    "Follow OUTPUT FORMAT in the user instructions exactly.",
    videoDurationSeconds === 30
      ? "For 30s: output PROMPT PART 1, PROMPT PART 2, then one FULL SEQUENCE line. Each part 120–180 words. Plain text only, no markdown."
      : "For 5s/10s/15s: output ONE compact prompt (120–180 words) as a continuous cinematic description. Plain text only, no markdown.",
    "The script and VIDEO_METADATA are the source of truth for dialogue and product behavior.",
  ].join("\n");

  const user = [
    UGC_I2V_PROMPT_INSTRUCTIONS,
    "",
    "---",
    `Target video duration for this run: ${String(videoDurationSeconds)} seconds.`,
    videoDurationSeconds === 30
      ? "You MUST output PROMPT PART 1 and PROMPT PART 2 (30s workflow — two 15s clips)."
      : "Output a single continuous video prompt (not PART 1 / PART 2).",
    "",
    "UGC SCRIPT FOR THIS ANGLE (includes voice profile — use it):",
    angleScript,
  ].join("\n");

  try {
    const text =
      provider === "claude"
        ? await claudeMessagesText({ system: developer, user })
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
