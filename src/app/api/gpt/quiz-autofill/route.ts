export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";

type Body = {
  url: string;
  title?: string | null;
  description?: string | null;
  snippets?: string[];
  signals?: { prices?: string[] };
  excerpt?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.url) return NextResponse.json({ error: "Missing `url`." }, { status: 400 });

  const developer = [
    "You are helping auto-fill a marketing quiz from a product page.",
    "Return STRICT JSON only.",
    "If you are unsure, write 'unknown' rather than inventing.",
    "Keep answers concise and practical.",
    "Always add a field `precisionNote` telling the user it's more accurate if they fill it themselves.",
  ].join("\n");

  const user = [
    "Auto-fill this quiz from the page context.",
    "Return JSON with keys:",
    "{ aboutProduct, problems, promises, persona, angles, offers, videoDurationPreference, precisionNote }",
    "videoDurationPreference must be one of: 15s, 20s, 30s.",
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
    const { text } = await openaiResponsesText({ developer, user });
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON.", raw: text }, { status: 502 });
    }

    return NextResponse.json({
      data: {
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
        precisionNote: String(
          parsed?.precisionNote ??
            "Auto-fill from URL is helpful, but it will be more precise if you write it yourself.",
        ),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

