export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";

type Body = {
  url: string;
  title?: string | null;
  description?: string | null;
  images?: string[];
  excerpt?: string;
  snippets?: string[];
  signals?: { prices?: string[] };
};

function safeSlice(s: string, max = 12000) {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n...[truncated]";
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.url) return NextResponse.json({ error: "Missing `url`." }, { status: 400 });

  const context = {
    url: body.url,
    title: body.title ?? null,
    description: body.description ?? null,
    prices: body.signals?.prices ?? [],
    images: Array.isArray(body.images) ? body.images.slice(0, 8) : [],
    excerpt: body.excerpt ? safeSlice(body.excerpt, 8000) : "",
    snippets: Array.isArray(body.snippets) ? body.snippets.slice(0, 10) : [],
  };

  const developer = [
    "You are a senior direct-response marketer and brand analyst.",
    "You MUST follow the user's process steps 1→9.",
    "Return STRICT JSON only (no markdown, no commentary).",
    "Use ONLY the provided page context. If unknown, set null or \"unknown\".",
    "Keep Step 1 output to 10-15 lines max.",
    "For Step 7, output MAX 5 angles, and make them strategic (no random angles).",
  ].join("\n");

  const user = [
    "Analyze this product page context and produce the full brand analysis.",
    "",
    "Process steps to output in JSON:",
    "step1_rawSheet (10-15 lines, no interpretation)",
    "step2_positioning (1 sentence)",
    "step3_problem: { mainProblem, customerVoiceLines[] }",
    "step4_mechanism: { explanation3Steps[], uniqueMechanism, proofs[] }",
    "step5_promise: { central, variants: { soft, direct, credible } }",
    "step6_personas: { primaryPersona, secondaryPersonas[] }",
    "step7_angles: [{ angle, hooks[] }], max 5",
    "step8_differentiation: { points[] } (3 points)",
    "step9_objections: [{ objection, response }]",
    "",
    "Also output quizPrefill matching the quiz questions:",
    "quizPrefill: { aboutProduct, problems, promises, persona, angles, offers, videoDurationPreference }",
    "",
    "Also output researchNotes: short bullet list of what you used from the page (claims, FAQ, proof).",
    "",
    "Page context JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");

  try {
    const { text } = await openaiResponsesText({ developer, user });

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Model returned non-JSON.", raw: text.slice(0, 4000) },
        { status: 502 },
      );
    }

    return NextResponse.json({ data: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

