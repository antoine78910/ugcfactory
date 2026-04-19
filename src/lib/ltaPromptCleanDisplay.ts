import {
  composeNanoEditableSections,
  composeThreeLabeledPrompts,
  mergeNanoPromptForApi,
  parseThreeLabeledPrompts,
  splitNanoPromptBodyForEditing,
} from "@/lib/linkToAdUniverse";
import type { VideoPromptEditableSections } from "@/lib/linkToAdUniverse";

export type LtaImageSlotClean = {
  avatar: string;
  scene: string;
  shot: string;
  hiddenTechnical?: string;
};

export type LtaVideoPromptClean = {
  motion: string;
  dialogue: string;
  ambience: string;
  hiddenTechnical?: string;
  /** When true, treat motion as one blob (legacy single-field UI). */
  legacySingleField?: boolean;
};

function parseJsonFromAssistant(text: string): unknown {
  const s = String(text || "").trim();
  if (!s) throw new Error("Empty model output.");
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s);
  const inner = (fence ? fence[1] : s).trim();
  return JSON.parse(inner);
}

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
}

/** Validates and normalizes the image-slots JSON from `/api/gpt/link-to-ad-prompt-clean`. */
export function parseLinkToAdImageSlotsCleanPayload(data: unknown): LtaImageSlotClean[] | null {
  if (!data || typeof data !== "object") return null;
  const slots = (data as { slots?: unknown }).slots;
  if (!Array.isArray(slots) || slots.length !== 3) return null;
  const out: LtaImageSlotClean[] = [];
  for (let i = 0; i < 3; i++) {
    const row = slots[i];
    if (!row || typeof row !== "object") return null;
    const o = row as Record<string, unknown>;
    out.push({
      avatar: asTrimmedString(o.avatar ?? o.person),
      scene: asTrimmedString(o.scene),
      shot: asTrimmedString(o.shot ?? o.product),
      hiddenTechnical: asTrimmedString(o.hiddenTechnical ?? o.technical ?? ""),
    });
  }
  return out;
}

export function parseLinkToAdVideoPromptCleanPayload(data: unknown): LtaVideoPromptClean | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const motion = asTrimmedString(o.motion);
  const dialogue = asTrimmedString(o.dialogue);
  const ambience = asTrimmedString(o.ambience);
  const legacy = o.legacySingleField === true || o.isLegacyBlob === true;
  if (!motion && !dialogue && !ambience) return null;
  return {
    motion,
    dialogue,
    ambience,
    hiddenTechnical: asTrimmedString(o.hiddenTechnical ?? o.technical ?? ""),
    legacySingleField: legacy,
  };
}

export function parseLinkToAdPromptCleanResponse(
  text: string,
  kind: "image_slots" | "video_prompt",
): LtaImageSlotClean[] | LtaVideoPromptClean | null {
  const data = parseJsonFromAssistant(text);
  if (kind === "image_slots") return parseLinkToAdImageSlotsCleanPayload(data);
  return parseLinkToAdVideoPromptCleanPayload(data);
}

/**
 * Rebuilds `PROMPT 1/2/3` raw text from cleaned creative triples, preserving each slot’s
 * existing technical tail and appending model-returned hidden lines.
 */
export function rebuildNanoBananaRawFromCleanSlots(
  previousRaw: string,
  cleaned: LtaImageSlotClean[],
): string {
  const prevBodies = parseThreeLabeledPrompts(previousRaw.replace(/\r\n/g, "\n"));
  const mergedBodies: [string, string, string] = ["", "", ""] as [string, string, string];
  for (let i = 0; i < 3; i++) {
    const orig = prevBodies[i] ?? "";
    const { technicalTail } = splitNanoPromptBodyForEditing(orig);
    const c = cleaned[i] ?? { avatar: "", scene: "", shot: "", hiddenTechnical: "" };
    const creative = composeNanoEditableSections({
      person: c.avatar,
      scene: c.scene,
      product: c.shot,
    });
    const extra = (c.hiddenTechnical ?? "").trim();
    const tail = [technicalTail, extra].filter(Boolean).join("\n\n").trim();
    mergedBodies[i] = mergeNanoPromptForApi(creative, tail).trim();
  }
  return composeThreeLabeledPrompts(mergedBodies);
}

export function mergeVideoHiddenTechnical(existingTail: string, hidden?: string): string {
  return [existingTail.trim(), (hidden ?? "").trim()].filter(Boolean).join("\n\n").trim();
}

export function videoSectionsFromClean(c: LtaVideoPromptClean): VideoPromptEditableSections {
  return {
    motion: c.motion,
    dialogue: c.dialogue,
    ambience: c.ambience,
  };
}
