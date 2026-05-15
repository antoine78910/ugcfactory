import type { RecreateAnalyzeResponse, RecreateScene } from "@/lib/recreateAnalysis";

export type RecreateProjectStatus = "in_progress" | "archived";

export type RecreateKeyframeSlotStatus = "idle" | "processing" | "ready" | "error";

export type RecreateKeyframeSlot = {
  status: RecreateKeyframeSlotStatus;
  /** Per-frame product reference; falls back to project-level product when generating. */
  productImageUrl?: string;
  taskId?: string;
  outputUrl?: string;
  error?: string;
  updatedAt?: string;
};

export type RecreateProjectAssets = {
  productImageUrl: string | null;
  packagingImageUrl: string | null;
  logoImageUrl: string | null;
};

export function resolveFrameProductUrl(
  slot: RecreateKeyframeSlot | undefined,
  projectProductUrl: string | null | undefined,
): string {
  const slotUrl = (slot?.productImageUrl ?? "").trim();
  if (/^https?:\/\//i.test(slotUrl)) return slotUrl;
  const fallback = (projectProductUrl ?? "").trim();
  return /^https?:\/\//i.test(fallback) ? fallback : "";
}

export type RecreateSceneKeyframes = {
  start: RecreateKeyframeSlot;
  end: RecreateKeyframeSlot;
};

export type RecreateProjectClientState = {
  scriptDraft?: string;
  scriptApproved?: boolean;
  imageModelChoice?: string;
  sceneModelChoice?: Record<string, string>;
  scenePromptOverrides?: Record<string, string>;
};

export type RecreateProjectRow = {
  id: string;
  user_id: string;
  title: string;
  status: RecreateProjectStatus;
  video_url: string | null;
  video_file_name: string | null;
  duration_sec: number | null;
  analysis_json: RecreateAnalyzeResponse | Record<string, unknown>;
  product_image_url: string | null;
  packaging_image_url: string | null;
  logo_image_url: string | null;
  keyframes_json: Record<string, RecreateSceneKeyframes>;
  client_state_json: RecreateProjectClientState;
  created_at: string;
  updated_at: string;
};

export function emptySceneKeyframes(): RecreateSceneKeyframes {
  return {
    start: { status: "idle" },
    end: { status: "idle" },
  };
}

export type RecreateKeyframeGenerationInput = {
  /** input_urls[0] = scene frame, [1] = product, optional packaging/logo after. */
  imageUrls: string[];
  prompt: string;
};

function trimOneLine(s: string, max = 220): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * GPT Image 2 i2i: image 1 = scene still, image 2 = hero product (required), optional packaging/logo.
 * Prompt explicitly maps @image indices so the model swaps product instead of re-describing the whole scene.
 */
export function buildRecreateKeyframeGeneration(opts: {
  scene: RecreateScene;
  role: "start" | "end";
  sceneFrameUrl: string;
  productUrl: string;
  packagingUrl?: string | null;
  logoUrl?: string | null;
}): RecreateKeyframeGenerationInput {
  const { scene, role } = opts;
  const roleLabel = role === "start" ? "start" : "end";
  const beat = trimOneLine(
    role === "start" ? (scene.startDescription ?? "") : (scene.endDescription ?? ""),
    180,
  );
  const style = (scene.visualStyleCategory ?? "unknown").replace(/_/g, " ");

  const hasPackaging = /^https?:\/\//i.test((opts.packagingUrl ?? "").trim());
  const hasLogo = /^https?:\/\//i.test((opts.logoUrl ?? "").trim());

  const imageLines = [
    "IMAGE 1 — Scene frame (layout reference): This is the exact " +
      `${roleLabel} frame from the reference ad (${scene.sceneId}). ` +
      "Keep the same camera angle, framing, composition, background, lighting, color grade, and character/talent blocking as IMAGE 1. " +
      "Do not change the set layout or add new watermarks.",
    "IMAGE 2 — Hero product (swap target): The client's real product. Replace ONLY the product or pack visible in IMAGE 1 with the product shown in IMAGE 2. " +
      "Match perspective, scale, placement, and lighting to IMAGE 1. Use accurate colors, label art, and materials from IMAGE 2.",
  ];

  if (hasPackaging) {
    imageLines.push(
      "IMAGE 3 — Packaging reference: If packaging appears in the shot, match this pack design (shape, label, colors) when integrating the product.",
    );
  }
  if (hasLogo) {
    imageLines.push(
      `IMAGE ${hasPackaging ? 4 : 3} — Logo reference: Use this logo only where a brand mark belongs; do not add random text.`,
    );
  }

  const contextBits = [
    beat ? `Scene beat: ${beat}.` : "",
    `Visual style to preserve: ${style}.`,
    trimOneLine(scene.recreationNotes ?? "", 160)
      ? `Style notes: ${trimOneLine(scene.recreationNotes ?? "", 160)}.`
      : "",
  ].filter(Boolean);

  const prompt = [
    "Product swap on one advertising still. Output a single frame.",
    "",
    ...imageLines,
    "",
    "Rules: Edit IMAGE 1 in place — swap the product using IMAGE 2. Everything else stays as in IMAGE 1.",
    "No extra captions, UI chrome, or competitor branding unless already in IMAGE 1.",
    ...contextBits,
  ].join("\n");

  const imageUrls = [opts.sceneFrameUrl.trim(), opts.productUrl.trim()];
  if (hasPackaging) imageUrls.push((opts.packagingUrl ?? "").trim());
  if (hasLogo) imageUrls.push((opts.logoUrl ?? "").trim());

  return { imageUrls, prompt };
}

/** @deprecated Use buildRecreateKeyframeGeneration */
export function buildRecreateProductSwapPrompt(opts: {
  scene: RecreateScene;
  role: "start" | "end";
}): string {
  return buildRecreateKeyframeGeneration({
    scene: opts.scene,
    role: opts.role,
    sceneFrameUrl: "https://placeholder.invalid/frame",
    productUrl: "https://placeholder.invalid/product",
  }).prompt;
}
