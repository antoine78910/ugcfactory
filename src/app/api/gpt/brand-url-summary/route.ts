export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { claudeMessagesText } from "@/lib/claudeResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { makeCacheKey } from "@/lib/gptCache";

type Body = {
  url: string;
  provider?: "gpt" | "claude";
};

async function fetchPageText(url: string, maxChars = 12_000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SpEEL/1.0)" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.slice(0, maxChars);
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  const { supabase, response, user: authUser } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const url = body?.url?.trim();
  if (!url) return NextResponse.json({ error: "Missing `url`." }, { status: 400 });

  const provider: "gpt" | "claude" = body?.provider === "gpt" ? "gpt" : "claude";

  const EXAMPLE_SKULT =
    "Skult Men is a men's skincare brand offering products designed to improve facial appearance and deliver a more defined jawline and a more sculpted face. The hero product, the Collagen Face Sculpt Wrap, is a facial mask meant to help firm skin, improve elasticity, and create the look of a more toned, structured face. The core problem it addresses is dissatisfaction with facial definition among men—especially a weak jawline, a face that feels too round or slack, or loss of skin firmness. That tension can affect perceived masculinity, attractiveness, and self-confidence. The central product promise is to help visibly firm and sculpt the face using collagen and a tightening effect, for a sharper jawline and clearer facial structure. The transformation sold is moving from a softer or less defined face to one that looks more sculpted, masculine, and structured. The primary audience is men roughly 20–40 who care about appearance, are into grooming and optimizing how they look, and respond to modern aesthetic cues (strong jawline, structured face). Their main pains are lack of facial definition, a face that looks too round or tired, and wanting to improve looks without invasive procedures. Their desires include a clearer jawline, a more masculine-looking face, compliments, and more confidence in how they look. Key objections may be whether it really works, how long until results show, whether the effect lasts, and whether it suits all skin types. The strongest marketing angles are transformation (before/after jawline), masculinity (more structured, virile look), simple solution (an easy at-home mask), confidence (better presence and appearance), and social proof (testimonials and visible results). Overall, Skult Men positions as a men's grooming brand promising visible improvement in facial definition and selling the idea of a more sculpted, masculine, confident face through a simple, accessible solution.";

  const userPrompt = [
    "From this URL, cover every product benefit and the problem it solves so the product is fully understood: how it is applied and how to use it—critical for realistic UGC.",
    "",
    `Product URL: ${url}`,
    "",
    "Output a detailed brand brief. Include enough on how to use it so UGC can show the benefit clearly—without dwelling on it too long.",
    "",
    "Match the form and structure of the example below (concise, clear, do not diverge). The example shows structure and tone only—not content to copy for another brand.",
    "",
    "Structure example (after the prefix \"Brand brief:\"):",
    `Brand brief: ${EXAMPLE_SKULT}`,
    "",
    "Formatting rules:",
    "- Start exactly with: Brand brief:",
    "- Then one continuous paragraph in English.",
    "- Same order and flow as the example: brand / product and benefits, problem solved, promise, transformation, audience, pains, desires, objections, marketing angles, overall positioning.",
    "- Clearly weave in benefits, the problem addressed, and usage / application (for credible UGC).",
    "- Do not exceed ~500 words.",
    "",
    "Generate the brand brief for the URL above now.",
  ].join("\n");

  try {
    const cacheKey = makeCacheKey({ v: 4, url, provider });
    try {
      const { data: hit } = await supabase
        .from("gpt_cache")
        .select("output")
        .eq("kind", "brand_url_summary")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (hit?.output) {
        const output = hit.output;
        const summaryText =
          typeof output === "string"
            ? output
            : typeof output?.summaryText === "string"
              ? output.summaryText
              : JSON.stringify(output);
        return NextResponse.json({ data: summaryText, cached: true });
      }
    } catch {
      // ignore cache failures
    }

    let text: string;

    if (provider === "claude") {
      const pageText = await fetchPageText(url);

      const claudeSystem = [
        "You are a senior expert in direct-response marketing and brand / product analysis.",
        "You will receive the text content scraped from the product page. Analyze it thoroughly before writing the brief.",
        "Respond ONLY with the requested brand brief, in English.",
        "The output MUST follow exactly the shape and structure of the example in the user message.",
        "No extra headings, no bullet lists, no structured sections: one continuous flow of text after the initial label.",
        "Stay concise and clear, do not diverge from the template (length comparable to the example, target ~380 words, max ~500 words).",
      ].join("\n");

      const claudeUser = pageText
        ? `${userPrompt}\n\n---\nSCRAPED PAGE CONTENT (from ${url}):\n${pageText}`
        : userPrompt;

      text = await claudeMessagesText({ system: claudeSystem, user: claudeUser, maxTokens: 1500 });
    } else {
      const gptDeveloper = [
        "You are a senior expert in direct-response marketing and brand / product analysis.",
        "You MUST use the web search tool to open and analyze the provided product URL (and useful pages on the same site if needed) before writing the brief.",
        "Respond ONLY with the requested brand brief, in English.",
        "The output MUST follow exactly the shape and structure of the example in the user message.",
        "No extra headings, no bullet lists, no structured sections: one continuous flow of text after the initial label.",
        "Stay concise and clear, do not diverge from the template (length comparable to the example, target ~380 words, max ~500 words).",
      ].join("\n");

      const model = process.env.OPENAI_BRAND_SUMMARY_MODEL?.trim() || "gpt-5-mini";
      ({ text } = await openaiResponsesText({
        developer: gptDeveloper,
        user: userPrompt,
        model,
        tools: [{ type: "web_search", search_context_size: "medium" }],
      }));
    }

    try {
      await supabase
        .from("gpt_cache")
        .insert({
          user_id: authUser.id,
          kind: "brand_url_summary",
          cache_key: cacheKey,
          output: { summaryText: text },
        })
        .throwOnError();
    } catch {
      // ignore cache insert failures
    }

    return NextResponse.json({ data: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

