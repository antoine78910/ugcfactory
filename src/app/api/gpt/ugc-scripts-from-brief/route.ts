export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText, openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { makeCacheKey } from "@/lib/gptCache";
import { claudeMessagesText, claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import {
  durationRulesForUgcApi,
  normalizeUgcScriptVideoDurationSec,
  UGC_SCRIPT_INSTRUCTIONS,
} from "@/lib/ugcAiScriptBrief";
import { MAX_GPT_PRODUCT_REFERENCE_IMAGES } from "@/lib/productReferenceImages";
import { sanitizeUgcAngleScriptText } from "@/lib/sanitizeUgcAngleScript";

type Body = {
  storeUrl?: string;
  productTitle?: string | null;
  brandBrief: string;
  /** Optional: pass prior scripts to avoid repeating the same angles. */
  previousScriptsText?: string | null;
  /** @deprecated Prefer `productImageUrls`; kept for older clients */
  productImageUrl?: string | null;
  /** Up to 3 HTTPS product references (multi-angle) for GPT vision */
  productImageUrls?: string[] | null;
  /** Optional persona/avatar reference images — when present, scripts skip text persona description. */
  avatarImageUrls?: string[] | null;
  /** 5 | 10 | 15 | 30 (legacy: 8 → 10s tier). Drives max spoken-word count per script. */
  videoDurationSeconds?: number;
  generationMode?: "automatic" | "custom_ugc";
  customUgcIntent?: string | null;
  provider?: "gpt" | "claude";
};

function collectHttpsProductImageUrls(body: Body): string[] {
  const raw: string[] = [];
  if (Array.isArray(body.productImageUrls)) {
    for (const x of body.productImageUrls) {
      if (typeof x === "string" && x.trim()) raw.push(x.trim());
    }
  }
  const single = body.productImageUrl?.trim();
  if (single) raw.push(single);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (!/^https?:\/\//i.test(r) || seen.has(r)) continue;
    seen.add(r);
    out.push(r);
    if (out.length >= MAX_GPT_PRODUCT_REFERENCE_IMAGES) break;
  }
  return out;
}

export async function POST(req: Request) {
  const { supabase, response, user: authUser } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const brandBrief = body?.brandBrief?.trim();
  if (!brandBrief) {
    return NextResponse.json({ error: "Missing `brandBrief`." }, { status: 400 });
  }

  const storeUrl = body?.storeUrl?.trim() ?? "";
  const productTitle = body?.productTitle?.trim() || null;
  const imageUrls = collectHttpsProductImageUrls(body ?? ({} as Body));
  const imageUrl = imageUrls[0] ?? null;
  const avatarRefs = Array.isArray(body?.avatarImageUrls)
    ? body.avatarImageUrls
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((u): u is string => /^https?:\/\//i.test(u))
        .slice(0, 3)
    : [];

  const videoDurationSeconds = normalizeUgcScriptVideoDurationSec(body?.videoDurationSeconds);
  const generationMode = body?.generationMode === "custom_ugc" ? "custom_ugc" : "automatic";
  const customUgcIntent = body?.customUgcIntent?.trim() || "";
  const previousScriptsText = body?.previousScriptsText?.trim() || "";
  const provider: "gpt" | "claude" = body?.provider === "gpt" ? "gpt" : "claude";
  const scriptLanguageName = "English";

  const developer = [
    "Follow EVERY rule and the exact output structure in the instructions below.",
    `All spoken script lines must be in ${scriptLanguageName}.`,
    `${durationRulesForUgcApi(videoDurationSeconds)} For word limits: count only HOOK, PROBLEM, SOLUTION, CTA lines (when PROBLEM exists).`,
    "Output plain text only, using the section headings exactly as specified (SCRIPT OPTION 1, VIDEO_METADATA, etc.).",
    generationMode === "custom_ugc"
      ? `Generation mode: CUSTOM UGC INTENT. Respect this user intent while still following all structural rules: ${customUgcIntent || "No talk, product-focused visual UGC."}`
      : "Generation mode: AUTOMATIC (standard Link to Ad).",
    previousScriptsText
      ? "Important: generate 3 NEW angles that are meaningfully different from the previous set. Do NOT reuse the same headline/hook/problem/benefits/CTA, and avoid similar phrasing."
      : "",
    "",
    UGC_SCRIPT_INSTRUCTIONS,
  ].join("\n");

  const imageNote =
    imageUrls.length === 0
      ? "No product image is attached; rely on the brand brief text only."
      : imageUrls.length > 1
        ? `I am attaching ${String(imageUrls.length)} product reference images (different angles when available) so you understand shape, branding, and packaging.`
        : "I am also attaching the product image for reference.";

  const avatarNote = avatarRefs.length > 0
    ? `AVATAR/PERSONA REFERENCE IMAGES ATTACHED: ${String(avatarRefs.length)} image(s). This is the person who will appear in the video. Match their appearance exactly. Do NOT describe their physical appearance in the script text — the image is the visual source of truth. Set avatar_source: REFERENCE IMAGE.`
    : "No avatar/persona reference image attached. Describe the persona fully in each script and set avatar_source: TEXT GENERATED.";

  const userPayload = [
    "Create 3 UGC video scripts for this product.",
    "",
    "Brand brief:",
    brandBrief,
    previousScriptsText ? "" : "",
    previousScriptsText ? "Previous angles (do NOT repeat these; create 3 different angles):" : "",
    previousScriptsText ? previousScriptsText : "",
    "",
    `Target video length (user selected in the app): ${String(videoDurationSeconds)} seconds.`,
    `You MUST respect the spoken-word cap for this exact length — shorter videos mean fewer words (see system rules). Do not write for a different duration.`,
    "",
    "The scripts must follow the UGC AI script structure.",
    "Test 3 different marketing angles.",
    generationMode === "custom_ugc"
      ? `Custom UGC intent from user: ${customUgcIntent || "No talk, just show the product naturally."}`
      : "Mode: automatic generation from URL context.",
    "",
    imageNote,
    "",
    avatarNote,
  ].join("\n");

  try {
    const cacheKey = makeCacheKey({
      v: 9,
      kind: "ugc_scripts_from_brief",
      provider,
      brandBrief,
      previousScriptsText,
      imageUrlsJoined: imageUrls.join("|"),
      avatarUrlsJoined: avatarRefs.join("|"),
      videoDurationSeconds,
      generationMode,
      customUgcIntent,
      storeUrl,
      productTitle,
    });

    try {
      const { data: hit } = await supabase
        .from("gpt_cache")
        .select("output")
        .eq("kind", "ugc_scripts_from_brief")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (hit?.output) {
        const output = hit.output as { scriptsText?: string };
        if (typeof output?.scriptsText === "string") {
          return NextResponse.json({ data: output.scriptsText, cached: true });
        }
      }
    } catch {
      // ignore cache read errors
    }

    const allImageUrls = [...imageUrls, ...avatarRefs];
    const text =
      provider === "claude"
        ? allImageUrls.length > 0
          ? await claudeMessagesTextWithImages({ system: developer, user: userPayload, imageUrls: allImageUrls })
          : await claudeMessagesText({ system: developer, user: userPayload })
        : allImageUrls.length > 0
          ? (await openaiResponsesTextWithImages({ developer, userText: userPayload, imageUrls: allImageUrls })).text
          : (await openaiResponsesText({ developer, user: userPayload })).text;

    const cleaned = sanitizeUgcAngleScriptText(String(text ?? ""), videoDurationSeconds);

    try {
      await supabase
        .from("gpt_cache")
        .insert({
          user_id: authUser.id,
          kind: "ugc_scripts_from_brief",
          cache_key: cacheKey,
          output: { scriptsText: cleaned },
        })
        .throwOnError();
    } catch {
      // ignore cache insert failures
    }

    return NextResponse.json({ data: cleaned });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
