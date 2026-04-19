export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Kind = "image" | "video" | "variation";

type Body = {
  kind: Kind;
  /** What the user wants in plain language */
  description: string;
  existingPrompt?: string;
  aspectRatio?: string;
};

const MAX_DESC = 4000;

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return t.trim();
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const kind = body?.kind;

  if (!description) {
    return NextResponse.json({ error: "Missing or empty `description`." }, { status: 400 });
  }
  if (description.length > MAX_DESC) {
    return NextResponse.json({ error: "Description is too long." }, { status: 400 });
  }
  if (kind !== "image" && kind !== "video" && kind !== "variation") {
    return NextResponse.json({ error: "Invalid `kind`." }, { status: 400 });
  }

  const existing = typeof body?.existingPrompt === "string" ? body.existingPrompt.trim() : "";
  const aspect = typeof body?.aspectRatio === "string" ? body.aspectRatio.trim() : "";

  const kindInstructions: Record<Kind, string> = {
    image: [
      "You write ONE text-to-image prompt for a photorealistic UGC / lifestyle look.",
      "Single flowing paragraph. No bullet points, no numbered lists, no headings.",
      "No negative-prompt section. No quotes around the whole prompt.",
      "Match the language of the user's description (if they write in French, respond in French; otherwise English).",
      "Respect the aspect ratio hint only as framing (e.g. vertical 9:16 vs wide 16:9), without naming the ratio in the text.",
    ].join("\n"),
    video: [
      "You write ONE concise video-generation prompt: subject, motion, camera, lighting, mood, and key beats.",
      "Single flowing paragraph suitable for text-to-video or image-to-video tools.",
      "No bullet points, no section titles, no markdown fences.",
      "Match the language of the user's description (French if they write in French, otherwise English).",
    ].join("\n"),
    variation: [
      "You write ONE short creative brief for how an ad should vary: messaging angle, visual tweaks, hook, CTA emphasis, or format ideas.",
      "Single paragraph a designer could follow. No bullets, no markdown.",
      "Match the language of the user's description.",
    ].join("\n"),
  };

  const developer = [
    "You are a prompt assistant inside a workflow editor.",
    "Non-interactive: never ask questions, never ask for more inputs, never add prefaces or disclaimers.",
    "Output ONLY the final prompt text, nothing before or after it.",
    "",
    kindInstructions[kind],
  ].join("\n");

  const user = [
    `Node type: ${kind}.`,
    aspect ? `Target aspect ratio (hint for framing): ${aspect}.` : "",
    existing ? `Current prompt on the node (refine or replace as the user intends, they describe their goal below):\n${existing}` : "Current prompt on the node: (empty)",
    "",
    "User description of what they want:",
    description,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { text } = await openaiResponsesText({ developer, user });
    const prompt = stripCodeFences(text);
    if (!prompt) {
      return NextResponse.json({ error: "Empty response from model." }, { status: 502 });
    }
    return NextResponse.json({ prompt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
