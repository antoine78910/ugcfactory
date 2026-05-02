export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { WORKFLOW_IMAGE_TO_JSON_DEVELOPER } from "@/app/workflow/workflowImageToJsonPreset";
import { claudeMessagesText, claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import { openaiResponsesText, openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type AssistantModel = "claude-sonnet-4-5" | "gpt-5o";

type Body = {
  prompt: string;
  model?: AssistantModel;
  /** Public HTTPS URLs the server can fetch and send as vision inputs (recommended for Claude; GPT resolves URLs remotely). */
  imageUrls?: string[];
  visionPreset?: "image_to_json";
};

const MAX_PROMPT = 12_000;
const WORKFLOW_ASSISTANT_DEVELOPER_TEXT = [
  "You are a concise workflow assistant used inside a node editor.",
  "Return direct, practical output with no preface and no markdown code fences.",
  "If the user asks for a prompt/script/copy, return a clean ready-to-use text block.",
  "If they ask a question, answer with concise actionable guidance.",
].join("\n");

function filterHttpsImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const u = typeof x === "string" ? x.trim() : "";
    if (!/^https:\/\//i.test(u)) continue;
    out.push(u);
    if (out.length >= 12) break;
  }
  return out;
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const model = body?.model === "gpt-5o" ? "gpt-5o" : "claude-sonnet-4-5";
  const imageUrls = filterHttpsImageUrls(body?.imageUrls);
  const visionPreset = body?.visionPreset === "image_to_json" ? "image_to_json" : undefined;

  if (!prompt) {
    return NextResponse.json({ error: "Missing `prompt`." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT) {
    return NextResponse.json({ error: "Prompt too long." }, { status: 400 });
  }

  if (visionPreset === "image_to_json" && imageUrls.length === 0) {
    return NextResponse.json(
      {
        error: "image_to_json requires at least one public HTTPS image URL.",
      },
      { status: 400 },
    );
  }

  const developer =
    visionPreset === "image_to_json"
      ? WORKFLOW_IMAGE_TO_JSON_DEVELOPER
      : imageUrls.length > 0
        ? WORKFLOW_ASSISTANT_DEVELOPER_TEXT + "\nUse the attached image(s); ground answers in pixels, not guesses."
        : WORKFLOW_ASSISTANT_DEVELOPER_TEXT;

  const visionMaxTokens =
    visionPreset === "image_to_json" ? 8192 : imageUrls.length > 0 ? 6144 : 4096;

  try {
    if (imageUrls.length > 0) {
      if (model === "gpt-5o") {
        const { text } = await openaiResponsesTextWithImages({
          developer,
          userText: prompt,
          imageUrls,
          model: "gpt-5.2",
        });
        return NextResponse.json({ output: text.trim() });
      }

      const output = await claudeMessagesTextWithImages({
        system: developer,
        user: prompt,
        imageUrls,
        model: "claude-sonnet-4-5-20250929",
        maxTokens: visionMaxTokens,
      });
      return NextResponse.json({ output: output.trim() });
    }

    if (model === "gpt-5o") {
      const { text } = await openaiResponsesText({
        developer,
        user: prompt,
        model: "gpt-5.2",
      });
      return NextResponse.json({ output: text.trim() });
    }

    const output = await claudeMessagesText({
      system: developer,
      user: prompt,
      model: "claude-sonnet-4-5-20250929",
      maxTokens: 4096,
    });
    return NextResponse.json({ output: output.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
