export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { claudeMessagesText } from "@/lib/claudeResponses";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type AssistantModel = "claude-sonnet-4-5" | "gpt-5o";

type Body = {
  prompt: string;
  model?: AssistantModel;
};

const MAX_PROMPT = 12_000;

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const model = body?.model === "gpt-5o" ? "gpt-5o" : "claude-sonnet-4-5";

  if (!prompt) {
    return NextResponse.json({ error: "Missing `prompt`." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT) {
    return NextResponse.json({ error: "Prompt too long." }, { status: 400 });
  }

  const developer = [
    "You are a concise workflow assistant used inside a node editor.",
    "Return direct, practical output with no preface and no markdown code fences.",
    "If the user asks for a prompt/script/copy, return a clean ready-to-use text block.",
    "If they ask a question, answer with concise actionable guidance.",
  ].join("\n");

  try {
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

