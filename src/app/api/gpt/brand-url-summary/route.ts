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
    "Tu es un expert senior en marketing direct-response et analyse marque / produit.",
    "Tu DOIS utiliser l’outil de recherche web pour ouvrir et analyser l’URL produit fournie (et pages utiles du même site si besoin) avant de rédiger le brief.",
    "Réponds UNIQUEMENT par le brand brief demandé, en français.",
    "La sortie DOIT suivre exactement la forme et la structure de l’exemple fourni dans le message utilisateur.",
    "Pas de titres supplémentaires, pas de listes à puces, pas de sections structurées : un seul flux de texte après le label initial.",
    "Reste concis et clair, ne diverge pas du modèle (longueur comparable à l’exemple, cible ~380 mots, plafond ~500 mots).",
  ].join("\n");

  const EXAMPLE_SKULT =
    "Skult Men est une marque de skincare masculine qui propose des produits destinés à améliorer l’apparence du visage et à donner une mâchoire plus définie et un visage plus sculpté. Le produit principal, le Collagen Face Sculpt Wrap, est un masque facial conçu pour aider à raffermir la peau, améliorer l’élasticité et donner l’apparence d’un visage plus tonique et plus structuré. Le problème principal que le produit adresse est l’insatisfaction liée à la définition du visage chez les hommes, notamment un manque de jawline marquée, un visage perçu comme trop rond ou relâché, ou encore une perte de fermeté de la peau. Cette problématique peut affecter la perception de masculinité, l’attractivité et la confiance en soi. La promesse centrale du produit est d’aider à raffermir et sculpter visuellement le visage grâce au collagène et à un effet tenseur, afin d’obtenir une mâchoire plus définie et un visage plus net. La transformation vendue est le passage d’un visage plus mou ou moins défini à un visage plus sculpté, plus masculin et plus structuré. La cible principale est un homme entre 20 et 40 ans, sensible à son apparence, intéressé par le grooming et l’optimisation de son physique, et influencé par les standards esthétiques modernes (jawline marquée, visage structuré). Ses douleurs principales sont un manque de définition du visage, un visage jugé trop rond ou fatigué, et une envie d’améliorer son apparence sans procédures invasives. Ses désirs sont d’avoir une jawline plus nette, un visage plus masculin, recevoir des compliments et se sentir plus confiant dans son apparence. Les principales objections peuvent être : est-ce que le produit fonctionne vraiment, combien de temps avant de voir les résultats, est-ce que l’effet est durable, et est-ce adapté à tous les types de peau. Les angles marketing les plus exploitables pour cette marque sont : l’angle transformation (avant/après jawline), l’angle masculinité (visage plus structuré et viril), l’angle solution simple (un masque facile à utiliser à la maison), l’angle confiance (améliorer l’apparence et la présence), et l’angle preuve sociale (témoignages et résultats visibles). Globalement, Skult Men se positionne comme une marque de grooming masculine qui promet une amélioration visible de la définition du visage et vend principalement l’idée d’un visage plus sculpté, plus masculin et plus confiant grâce à une solution simple et accessible.";

  const userPrompt = [
    "D’après cette URL, je veux que tu m’indiques tous les bénéfices du produit, le problème qu’il résout, pour bien cerner et connaître le produit à 100 % : comment il s’applique et comment l’utiliser — c’est très important pour pouvoir faire des UGC réalistes.",
    "",
    `URL du produit : ${url}`,
    "",
    "Tu me donneras en sortie un brand brief détaillé. N’oublie pas de dire comment l’utiliser, assez pour que l’on comprenne comment l’UGC pourra démontrer le bénéfice du produit — mais sans t’y attarder trop longtemps.",
    "",
    "Tu garderas la même forme et structure que l’exemple ci-dessous (concis, clair, ne diverge pas). L’exemple illustre uniquement la structure et le ton, pas le contenu à copier pour une autre marque.",
    "",
    "Exemple de structure (après le préfixe « Brand brief: ») :",
    `Brand brief: ${EXAMPLE_SKULT}`,
    "",
    "Règles de formatage :",
    "- Commence exactement par : Brand brief:",
    "- Puis un seul paragraphe continu en français.",
    "- Même ordre et flux que l’exemple : marque / produit et bénéfices, problème résolu, promesse, transformation, cible, douleurs, désirs, objections, angles marketing, positionnement global.",
    "- Intègre clairement les bénéfices, le problème adressé, et l’usage / application du produit (pour des UGC crédibles).",
    "- Ne dépasse pas ~500 mots.",
    "",
    "Génère maintenant le brand brief pour l’URL fournie ci-dessus.",
  ].join("\n");

  try {
    const cacheKey = makeCacheKey({ v: 3, url });
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

    const model =
      process.env.OPENAI_BRAND_SUMMARY_MODEL?.trim() || "gpt-5-mini";
    const { text } = await openaiResponsesText({
      developer,
      user: userPrompt,
      model,
      tools: [{ type: "web_search", search_context_size: "medium" }],
    });

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

