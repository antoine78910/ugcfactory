export const PROMPT_ENHANCE_SURFACES = ["studio-image", "studio-video", "workflow", "ads"] as const;
export type PromptEnhanceSurface = (typeof PROMPT_ENHANCE_SURFACES)[number];

export function parsePromptEnhanceSurface(raw: unknown): PromptEnhanceSurface {
  const s = typeof raw === "string" ? raw.trim() : "";
  if ((PROMPT_ENHANCE_SURFACES as readonly string[]).includes(s)) return s as PromptEnhanceSurface;
  return "workflow";
}

const INSTRUCTIONS: Record<PromptEnhanceSurface, string> = {
  "studio-image": [
    "You improve prompts for AI image generation.",
    "Add clear composition, lighting, subject detail, and style cues while staying faithful to the user's intent.",
    "Preserve every @mention token exactly (same spelling and casing).",
    "Output only the enhanced prompt as plain text — no title, no quotes, no markdown fences.",
  ].join(" "),
  "studio-video": [
    "You improve prompts for AI video generation.",
    "Add concrete motion, camera work, pacing, and shot continuity suited to short clips, without contradicting the user.",
    "Preserve every @mention token exactly (same spelling and casing).",
    "Output only the enhanced prompt as plain text — no title, no quotes, no markdown fences.",
  ].join(" "),
  workflow: [
    "You improve short prompts used in a node-based creative workflow.",
    "Keep the result concise and actionable for downstream generators.",
    "Preserve every @mention token exactly (same spelling and casing).",
    "Output only the enhanced prompt as plain text — no title, no quotes, no markdown fences.",
  ].join(" "),
  ads: [
    "You refine prompts for short-form UGC-style ad creatives.",
    "Clarify hook, visual beats, product context, and tone; do not invent offers, guarantees, or legal claims the user did not imply.",
    "Preserve every @mention token exactly (same spelling and casing).",
    "Output only the enhanced prompt as plain text — no title, no quotes, no markdown fences.",
  ].join(" "),
};

export function promptEnhanceSystem(surface: PromptEnhanceSurface): string {
  return INSTRUCTIONS[surface];
}
