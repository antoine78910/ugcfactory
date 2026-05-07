export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  WORKFLOW_VIDEO_TO_PROMPT_DEVELOPER,
  WORKFLOW_VIDEO_TO_PROMPT_USER_PROMPT,
} from "@/app/workflow/workflowVideoToPromptPreset";
import { claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Body = {
  prompt?: string;
  frameImageUrls?: string[];
};

function sanitizeHttpsUrls(raw: unknown, max = 12): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const u = typeof x === "string" ? x.trim() : "";
    if (!/^https:\/\//i.test(u)) continue;
    if (!out.includes(u)) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const prompt = typeof body?.prompt === "string" && body.prompt.trim()
    ? body.prompt.trim()
    : WORKFLOW_VIDEO_TO_PROMPT_USER_PROMPT;
  const frameImageUrls = sanitizeHttpsUrls(body?.frameImageUrls, 12);

  if (frameImageUrls.length === 0) {
    return NextResponse.json(
      { error: "Connect a video and wait for frame extraction (no frame images provided)." },
      { status: 400 },
    );
  }

  try {
    const output = await claudeMessagesTextWithImages({
      system: WORKFLOW_VIDEO_TO_PROMPT_DEVELOPER,
      user: prompt,
      imageUrls: frameImageUrls,
      model: "claude-opus-4-7",
      maxTokens: 1700,
    });
    const clean = output.trim();
    if (!clean) {
      return NextResponse.json({ error: "Empty model response." }, { status: 502 });
    }
    return NextResponse.json({
      output: clean,
      frameImageUrls,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate prompt from video frames.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

