export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { makeCacheKey } from "@/lib/gptCache";

type Body = {
  url: string;
  title?: string | null;
  description?: string | null;
  snippets?: string[];
  signals?: { prices?: string[] };
  excerpt?: string;
};

export async function POST(req: Request) {
  const { supabase, user: authUser, response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.url) return NextResponse.json({ error: "Missing `url`." }, { status: 400 });

  const developer = [
    "You are helping auto-fill a marketing quiz from a product page.",
    "Return STRICT JSON only.",
    "If you are unsure, write 'unknown' rather than inventing.",
    "Keep answers concise and practical.",
    "Always add a field `precisionNote` telling the user it's more accurate if they fill it themselves.",
  ].join("\n");

  const userPrompt = [
    "Auto-fill this quiz from the page context.",
    "Return JSON with keys:",
    "{ aboutProduct, problems, promises, persona, angles, offers, videoDurationPreference, videoScriptLanguage, precisionNote }",
    "videoDurationPreference must be one of: 15s, 20s, 30s.",
    "videoScriptLanguage must be one of: en, fr, es, de, it, pt (default en).",
    "",
    "Page context JSON:",
    JSON.stringify(
      {
        url: body.url,
        title: body.title ?? null,
        description: body.description ?? null,
        prices: body.signals?.prices ?? [],
        snippets: Array.isArray(body.snippets) ? body.snippets.slice(0, 8) : [],
        excerpt: typeof body.excerpt === "string" ? body.excerpt.slice(0, 2500) : "",
      },
      null,
      2,
    ),
  ].join("\n");

  try {
    const cacheKey = makeCacheKey({ v: 2, body });
    try {
      const { data: hit } = await supabase
        .from("gpt_cache")
        .select("output")
        .eq("kind", "quiz_autofill")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (hit?.output) return NextResponse.json({ data: hit.output, cached: true });
    } catch {
      // ignore cache failures
    }

    const { text } = await openaiResponsesText({ developer, user: userPrompt });
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON." }, { status: 502 });
    }

    const data = {
      aboutProduct: String(parsed?.aboutProduct ?? ""),
      problems: String(parsed?.problems ?? ""),
      promises: String(parsed?.promises ?? ""),
      persona: String(parsed?.persona ?? ""),
      angles: String(parsed?.angles ?? ""),
      offers: String(parsed?.offers ?? ""),
      videoDurationPreference:
        parsed?.videoDurationPreference === "20s" || parsed?.videoDurationPreference === "30s"
          ? parsed.videoDurationPreference
          : "15s",
      videoScriptLanguage:
        parsed?.videoScriptLanguage === "fr" ||
        parsed?.videoScriptLanguage === "es" ||
        parsed?.videoScriptLanguage === "de" ||
        parsed?.videoScriptLanguage === "it" ||
        parsed?.videoScriptLanguage === "pt"
          ? parsed.videoScriptLanguage
          : "en",
      precisionNote: String(
        parsed?.precisionNote ??
          "Auto-fill from URL is helpful, but it will be more precise if you write it yourself.",
      ),
    };

    try {
      await supabase
        .from("gpt_cache")
        .insert({ user_id: authUser.id, kind: "quiz_autofill", cache_key: cacheKey, output: data })
        .throwOnError();
    } catch {
      // ignore cache insert failures
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

