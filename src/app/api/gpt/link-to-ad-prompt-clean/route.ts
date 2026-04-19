export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openaiResponsesText } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Body =
  | {
      kind: "image_slots";
      /** Full bodies for PROMPT 1–3 (may include EDIT blocks + inline junk). */
      slots: [string, string, string];
    }
  | {
      kind: "video_prompt";
      /** Full stored video prompt (may include EDIT Motion/Dialogue/Ambience + junk). */
      text: string;
    };

const DEVELOPER_IMAGE = [
  "You sanitize Link-to-Ad NanoBanana image prompts for DISPLAY and editing.",
  "Return ONLY valid JSON (no markdown fences, no commentary).",
  "Input: 3 strings (PROMPT 1, 2, 3 bodies). Each may contain EDIT, Avatar / Scene / Shot blocks and leaked internal lines.",
  "For EACH slot output one object with keys: avatar, scene, shot, hiddenTechnical.",
  "- avatar: only on-camera person / creator description the marketer would tweak (wardrobe, age vibe, expression).",
  "- scene: only environment, set, lighting mood as creative direction (no gear model names, no codecs).",
  "- shot: framing, composition, product interaction, label readability as creative/marketing direction.",
  "- hiddenTechnical: every line that is internal quality control: codecs (4K, ProRes, Dolby, HDR, RAW), device names used as quality hacks (iPhone model laundry lists), tack sharp / zero grain / no filter spam, artifact-avoidance (Avoid jitter, bent limbs, distorted hands, extra fingers), color science, bitrate, LUTs, negative prompts, preservation blocks. Join with newlines.",
  "Rules:",
  "- Do NOT invent new products, claims, or scenes. Preserve brand and product names exactly when they appear in creative copy.",
  "- Do NOT rewrite marketing language: only move or trim clearly non-creative / technical lines into hiddenTechnical.",
  "- If a line mixes creative + technical, keep the creative clause in the right bucket and move only the technical tail to hiddenTechnical.",
  '- If a slot has no EDIT headers, still split meaning into avatar/scene/shot as best you can; put unclear residue in hiddenTechnical.',
  "Shape: { \"slots\": [ { \"avatar\": \"...\", \"scene\": \"...\", \"shot\": \"...\", \"hiddenTechnical\": \"...\" }, ... ] }",
].join("\n");

const DEVELOPER_VIDEO = [
  "You sanitize a Link-to-Ad UGC image-to-video prompt for DISPLAY.",
  "Return ONLY valid JSON (no markdown fences, no commentary).",
  "Input: one string that may contain EDIT, Motion / Dialogue / Ambience blocks or a legacy single paragraph.",
  "Output keys: motion, dialogue, ambience, hiddenTechnical, legacySingleField (boolean).",
  "- motion: camera blocking, movement, pacing, eyeline, product handling as creative direction.",
  "- dialogue: spoken lines and delivery notes only.",
  "- ambience: room tone / environmental audio the marketer cares about.",
  "- hiddenTechnical: codecs, resolution, device spec spam, artifact-avoidance laundry lists, internal negative prompts.",
  "- legacySingleField: true if the source is one blob without usable EDIT Motion/Dialogue/Ambience structure; then put the whole creative narrative in motion and leave dialogue/ambience empty.",
  "Do NOT invent dialogue. Preserve quoted lines and product names.",
  "Shape: { \"motion\": \"...\", \"dialogue\": \"...\", \"ambience\": \"...\", \"hiddenTechnical\": \"...\", \"legacySingleField\": false }",
].join("\n");

function clip(s: string, max = 14000): string {
  const t = String(s || "");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n[truncated]`;
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || (body.kind !== "image_slots" && body.kind !== "video_prompt")) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const model =
    process.env.OPENAI_LINK_TO_AD_PROMPT_CLEAN_MODEL?.trim() ||
    process.env.OPENAI_BRAND_SUMMARY_MODEL?.trim() ||
    "gpt-5-mini";

  try {
    if (body.kind === "image_slots") {
      if (!Array.isArray(body.slots) || body.slots.length !== 3) {
        return NextResponse.json({ error: "slots must be a length-3 array." }, { status: 400 });
      }
      const payload = body.slots.map((s, i) => `--- PROMPT ${i + 1} ---\n${clip(s)}`).join("\n\n");
      const { text } = await openaiResponsesText({
        model,
        developer: DEVELOPER_IMAGE,
        user: payload,
      });
      return NextResponse.json({ data: text });
    }

    const textIn = typeof body.text === "string" ? body.text : "";
    if (!textIn.trim()) {
      return NextResponse.json({ error: "Missing text." }, { status: 400 });
    }
    const { text } = await openaiResponsesText({
      model,
      developer: DEVELOPER_VIDEO,
      user: clip(textIn),
    });
    return NextResponse.json({ data: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
