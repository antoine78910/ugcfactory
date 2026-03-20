export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { makeCacheKey } from "@/lib/gptCache";

type Body = {
  url: string;
};

export async function POST(req: Request) {
  const { supabase, response, user: authUser } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const url = body?.url?.trim();
  if (!url) return NextResponse.json({ error: "Missing `url`." }, { status: 400 });

  const developer = [
    "You are a senior direct-response marketer and brand analyst.",
    "Return ONLY the requested Brand brief in English.",
    "Do not include extra sections beyond what the user asked for.",
  ].join("\n");

  // User-provided prompt requirement: we send the URL to GPT with this exact intent.
  const userPrompt = [
    "Thank to this url analyse in deepness the brand and give me a detailed summarize like this one:",
    "Brand brief:",
    "Skult Men est une marque de skincare masculine qui propose des produits destinés à améliorer l’apparence du visage et à donner une mâchoire plus définie et un visage plus sculpté. Le produit principal, le Collagen Face Sculpt Wrap, est un masque facial conçu pour aider à raffermir la peau, améliorer l’élasticité et donner l’apparence d’un visage plus tonique et plus structuré. Le problème principal que le produit adresse est l’insatisfaction liée à la définition du visage chez les hommes, notamment un manque de jawline marquée, un visage perçu comme trop rond ou relâché, ou encore une perte de fermeté de la peau. Cette problématique peut affecter la perception de masculinité, l’attractivité et la confiance en soi. La promesse centrale du produit est d’aider à raffermir et sculpter visuellement le visage grâce au collagène et à un effet tenseur, afin d’obtenir une mâchoire plus définie et un visage plus net. La transformation vendue est le passage d’un visage plus mou ou moins défini à un visage plus sculpté, plus masculin et plus structuré. La cible principale est un homme entre 20 et 40 ans, sensible à son apparence, intéressé par le grooming et l’optimisation de son physique, et influencé par les standards esthétiques modernes (jawline marquée, visage structuré). Ses douleurs principales sont un manque de définition du visage, un visage jugé trop rond ou fatigué, et une envie d’améliorer son apparence sans procédures invasives. Ses désirs sont d’avoir une jawline plus nette, un visage plus masculin, recevoir des compliments et se sentir plus confiant dans son apparence. Les principales objections peuvent être : est-ce que le produit fonctionne vraiment, combien de temps avant de voir les résultats, est-ce que l’effet est durable, et est-ce adapté à tous les types de peau. Les angles marketing les plus exploitables pour cette marque sont : l’angle transformation (avant/après jawline), l’angle masculinité (visage plus structuré et viril), l’angle solution simple (un masque facile à utiliser à la maison), l’angle confiance (améliorer l’apparence et la présence), et l’angle preuve sociale (témoignages et résultats visibles). Globalement, Skult Men se positionne comme une marque de grooming masculine qui promet une amélioration visible de la définition du visage et vend principalement l’idée d’un visage plus sculpté, plus masculin et plus confiant grâce à une solution simple et accessible.",
    "but in english",
    "",
    `URL: ${url}`,
  ].join("\n");

  try {
    const cacheKey = makeCacheKey({ v: 1, url });
    try {
      const { data: hit } = await supabase
        .from("gpt_cache")
        .select("output")
        .eq("kind", "brand_url_summary")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (hit?.output) {
        const output = hit.output;
        // output might be a string or { summaryText }
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

    const { text } = await openaiResponsesText({ developer, user: userPrompt });

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

