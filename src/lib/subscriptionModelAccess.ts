/**
 * Which Studio image/video models each subscription tier may use.
 * Policy: Starter includes paid-model access unless a model is explicitly gated higher.
 */

import { isSubscriptionPlanId, type SubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";
import {
  STUDIO_UNIFIED_IMAGE_PICKER_IDS,
  isStudioGoogleNanoBananaPickerId,
  isStudioSeedreamImagePickerId,
} from "@/lib/studioImageModels";
import { STUDIO_VIDEO_EDIT_PICKER_IDS } from "@/lib/studioVideoEditModels";

/** Includes free (credit packs / demo). */
export type AccountPlanId = "free" | SubscriptionPlanId;

const ORDER: AccountPlanId[] = ["free", "starter", "growth", "pro", "scale"];

/**
 * Effective tier for gating. **Free** is treated like **Starter** (rank 1) so credit-pack users
 * get the same studio model access as the first paid tier.
 */
export function planRank(planId: AccountPlanId): number {
  if (planId === "free") return 1;
  const i = ORDER.indexOf(planId);
  return i >= 0 ? i : 1;
}

export function parseAccountPlan(raw: unknown): AccountPlanId {
  if (raw == null || raw === "") return "free";
  if (raw === "free") return "free";
  if (typeof raw === "string" && isSubscriptionPlanId(raw)) return raw;
  return "free";
}

/** Minimum tier rank required (same index as ORDER). */
const IMAGE_MIN_RANK: Record<"nano" | "pro", number> = {
  nano: 0,
  pro: 2, // Restricted on Starter; open on Growth+
};

/** KIE / OpenAI ids used by Studio video panel + Veo API. */
const VIDEO_MIN_RANK: Record<string, number> = {
  "bytedance/seedance-1.5-pro": 0,
  "kling-2.6/video": 1, // Starter+
  // Starter should not include Seedance 2.0; unlock on Growth+
  "bytedance/seedance-2.0-pro": 2,
  "veo3_fast": 2,
  "kling-3.0/video": 2,
  veo3: 2,
  // Starter should include Sora 2
  "openai/sora-2": 1,
  "openai/sora-2-pro": 2,
};

/** Studio Edit Video tab: picker ids (`studio-edit/…`), not raw Kie strings. */
const VIDEO_EDIT_PICKER_MIN_RANK: Record<string, number> = {
  "studio-edit/grok": 2,
  "studio-edit/kling-omni": 2,
  "studio-edit/kling-o1": 2,
  "studio-edit/motion": 2,
  "studio-edit/motion-v3": 2,
};

/** Veo checkout body uses these keys; map to same gates as studio ids. */
const VEO_BODY_MODEL_MIN_RANK: Record<string, number> = {
  veo3_fast: VIDEO_MIN_RANK.veo3_fast,
  veo3: VIDEO_MIN_RANK.veo3,
};

export function canUseStudioImageModel(planId: AccountPlanId, model: "nano" | "pro"): boolean {
  return planRank(planId) >= IMAGE_MIN_RANK[model];
}

/** Studio Image picker row id (`nano` / `pro` / Seedream_*). Seedream = same minimum tier as NanoBanana Pro (Growth+). */
export function canUseStudioImagePickerModel(planId: AccountPlanId, pickerId: string): boolean {
  const id = pickerId.trim();
  if (id === "nano" || id === "pro") return canUseStudioImageModel(planId, id);
  if (isStudioSeedreamImagePickerId(id)) return planRank(planId) >= IMAGE_MIN_RANK.pro;
  if (isStudioGoogleNanoBananaPickerId(id) || id === "recraft_remove_background") {
    return planRank(planId) >= IMAGE_MIN_RANK.pro;
  }
  return false;
}

export function canUseStudioVideoModel(planId: AccountPlanId, marketModelId: string): boolean {
  const id = marketModelId.trim();
  const min = VIDEO_MIN_RANK[id];
  if (min === undefined) return false;
  return planRank(planId) >= min;
}

export function canUseStudioVideoEditPicker(planId: AccountPlanId, editPickerId: string): boolean {
  const id = editPickerId.trim();
  const min = VIDEO_EDIT_PICKER_MIN_RANK[id];
  if (min === undefined) return false;
  return planRank(planId) >= min;
}

export function canUseVeoApiModel(planId: AccountPlanId, veoModel: string | undefined): boolean {
  const key = (veoModel ?? "veo3_fast").trim();
  const min = VEO_BODY_MODEL_MIN_RANK[key];
  if (min === undefined) return false;
  return planRank(planId) >= min;
}

/** Motion Control = Kling 3.0 class; align with Kling 3.0 tier. */
export function canUseMotionControl(planId: AccountPlanId): boolean {
  return canUseStudioVideoModel(planId, "kling-3.0/video");
}

function planIdAtMinRank(rank: number): AccountPlanId {
  return ORDER[Math.max(0, Math.min(rank, ORDER.length - 1))];
}

export function minPlanForStudioImage(model: "nano" | "pro"): AccountPlanId {
  return planIdAtMinRank(IMAGE_MIN_RANK[model]);
}

export function minPlanForStudioImagePicker(pickerId: string): AccountPlanId {
  const id = pickerId.trim();
  if (id === "nano" || id === "pro") return minPlanForStudioImage(id);
  if (isStudioSeedreamImagePickerId(id)) return planIdAtMinRank(IMAGE_MIN_RANK.pro);
  if (isStudioGoogleNanoBananaPickerId(id) || id === "recraft_remove_background") {
    return planIdAtMinRank(IMAGE_MIN_RANK.pro);
  }
  return "scale";
}

export function minPlanForStudioVideo(marketModelId: string): AccountPlanId {
  const min = VIDEO_MIN_RANK[marketModelId.trim()];
  if (min === undefined) return "scale";
  return planIdAtMinRank(min);
}

export function minPlanForStudioVideoEditPicker(editPickerId: string): AccountPlanId {
  const min = VIDEO_EDIT_PICKER_MIN_RANK[editPickerId.trim()];
  if (min === undefined) return "scale";
  return planIdAtMinRank(min);
}

export function minPlanForVeo(veoModel: string | undefined): AccountPlanId {
  const key = (veoModel ?? "veo3_fast").trim();
  const min = VEO_BODY_MODEL_MIN_RANK[key];
  if (min === undefined) return "scale";
  return planIdAtMinRank(min);
}

const PLAN_DISPLAY: Record<AccountPlanId, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  scale: "Scale",
};

export function planDisplayName(planId: AccountPlanId): string {
  return PLAN_DISPLAY[planId] ?? planId;
}

export function upgradePlanMessage(requiredPlan: AccountPlanId, featureLabel: string): string {
  if (requiredPlan === "free") return "";
  const name = planDisplayName(requiredPlan);
  return `Upgrade to the ${name} plan to use ${featureLabel}.`;
}

const STUDIO_VIDEO_LABELS: Record<string, string> = {
  "kling-3.0/video": "Kling 3.0",
  "kling-2.6/video": "Kling 2.6",
  "openai/sora-2": "Sora 2",
  "openai/sora-2-pro": "Sora 2 Pro",
  "bytedance/seedance-1.5-pro": "Seedance 1.5 Pro",
  "bytedance/seedance-2.0-pro": "Seedance 2.0 Pro",
  veo3_fast: "Veo 3.1 Fast",
  veo3: "Veo 3.1",
};

const STUDIO_VIDEO_EDIT_PICKER_LABELS: Record<string, string> = {
  "studio-edit/kling-omni": "Kling 3.0 Omni Edit",
  "studio-edit/kling-o1": "Kling O1 Video Edit",
  "studio-edit/grok": "Grok Imagine Edit",
  "studio-edit/motion": "Kling Motion Control",
  "studio-edit/motion-v3": "Kling 3.0 Motion Control",
};

/** Order used in “included with your plan” lists (cheapest → premium). */
export const STUDIO_VIDEO_IDS_ORDERED: readonly string[] = [
  "bytedance/seedance-1.5-pro",
  "kling-2.6/video",
  "bytedance/seedance-2.0-pro",
  "veo3_fast",
  "kling-3.0/video",
  "veo3",
  "openai/sora-2",
  "openai/sora-2-pro",
];

export function studioVideoDisplayLabel(modelId: string): string {
  return STUDIO_VIDEO_LABELS[modelId] ?? modelId;
}

export function studioVideoEditPickerDisplayLabel(pickerId: string): string {
  return STUDIO_VIDEO_EDIT_PICKER_LABELS[pickerId] ?? pickerId;
}

export function studioImageDisplayLabel(model: "nano" | "pro"): string {
  return model === "pro" ? "NanoBanana Pro" : "NanoBanana";
}

const STUDIO_IMAGE_PICKER_LABELS: Record<string, string> = {
  seedream_45: "Seedream 4.5",
  seedream_45_text_to_image: "Seedream 4.5",
  seedream_45_image_to_image: "Seedream 4.5",
  seedream_50_lite: "Seedream 5.0 Lite",
  seedream_50_lite_text_to_image: "Seedream 5.0 Lite",
  seedream_50_lite_image_to_image: "Seedream 5.0 Lite",
  google_nano_banana: "Google Nano Banana",
  nanobanana_standard: "Google Nano Banana",
  google_nano_banana_edit: "Google Nano Banana",
  recraft_remove_background: "Recraft Remove Background",
};

export function studioImagePickerDisplayLabel(pickerId: string): string {
  if (pickerId === "nano" || pickerId === "pro") return studioImageDisplayLabel(pickerId);
  return STUDIO_IMAGE_PICKER_LABELS[pickerId] ?? pickerId;
}

/** Human-readable names for video models the user can use on this plan. */
export function listAllowedStudioVideoModels(planId: AccountPlanId): string[] {
  return STUDIO_VIDEO_IDS_ORDERED.filter((id) => canUseStudioVideoModel(planId, id)).map(
    (id) => STUDIO_VIDEO_LABELS[id] ?? id,
  );
}

/** Human-readable names for Edit Video pickers the user may use on this plan. */
export function listAllowedStudioVideoEditPickers(planId: AccountPlanId): string[] {
  return STUDIO_VIDEO_EDIT_PICKER_IDS.filter((id) => canUseStudioVideoEditPicker(planId, id)).map(
    (id) => studioVideoEditPickerDisplayLabel(id),
  );
}

/** Human-readable names for image models the user can use on this plan. */
export function listAllowedStudioImageModels(planId: AccountPlanId): string[] {
  const out: string[] = [];
  if (canUseStudioImageModel(planId, "nano")) out.push(studioImageDisplayLabel("nano"));
  if (canUseStudioImageModel(planId, "pro")) out.push(studioImageDisplayLabel("pro"));
  for (const id of STUDIO_UNIFIED_IMAGE_PICKER_IDS) {
    if (canUseStudioImagePickerModel(planId, id)) {
      const label = studioImagePickerDisplayLabel(id);
      if (!out.includes(label)) out.push(label);
    }
  }
  return out;
}

export function studioImageUpgradeMessage(
  planId: AccountPlanId,
  model: "nano" | "pro",
): string | null {
  if (canUseStudioImageModel(planId, model)) return null;
  const need = minPlanForStudioImage(model);
  return upgradePlanMessage(need, studioImageDisplayLabel(model));
}

export function studioImagePickerUpgradeMessage(planId: AccountPlanId, pickerId: string): string | null {
  if (canUseStudioImagePickerModel(planId, pickerId)) return null;
  const need = minPlanForStudioImagePicker(pickerId);
  return upgradePlanMessage(need, studioImagePickerDisplayLabel(pickerId));
}

export function studioVideoUpgradeMessage(planId: AccountPlanId, marketModelId: string): string | null {
  if (canUseStudioVideoModel(planId, marketModelId)) return null;
  const need = minPlanForStudioVideo(marketModelId);
  const label = studioVideoDisplayLabel(marketModelId);
  return upgradePlanMessage(need, label);
}

export function studioVideoEditUpgradeMessage(planId: AccountPlanId, editPickerId: string): string | null {
  if (canUseStudioVideoEditPicker(planId, editPickerId)) return null;
  const need = minPlanForStudioVideoEditPicker(editPickerId);
  const label = studioVideoEditPickerDisplayLabel(editPickerId);
  return upgradePlanMessage(need, label);
}

export function veoUpgradeMessage(planId: AccountPlanId, veoModel: string | undefined): string | null {
  if (canUseVeoApiModel(planId, veoModel)) return null;
  const need = minPlanForVeo(veoModel);
  const label = (veoModel ?? "veo3_fast") === "veo3" ? "Veo 3.1" : "Veo 3.1 Fast";
  return upgradePlanMessage(need, label);
}

export function motionControlUpgradeMessage(planId: AccountPlanId): string | null {
  if (canUseMotionControl(planId)) return null;
  return upgradePlanMessage(minPlanForStudioVideo("kling-3.0/video"), "Motion Control (Kling 3.0)");
}

// ---------------------------------------------------------------------------
// Subscription page matrix (Starter … Scale, four paid columns)
// ---------------------------------------------------------------------------

export type SubscriptionModelMatrixRow = {
  label: string;
  badges?: { text: string; className: string }[];
  /** [starter, growth, pro, scale] */
  tiers: [boolean, boolean, boolean, boolean];
};

/** Paid columns: Starter=1, Growth=2, Pro=3, Scale=4 in `planRank`. */
function tierBools(minRank: number): [boolean, boolean, boolean, boolean] {
  return [1, 2, 3, 4].map((r) => r >= minRank) as [boolean, boolean, boolean, boolean];
}

/** Rows shown under “Model access” on /subscription; synced with gates above. */
export const SUBSCRIPTION_MODEL_MATRIX_ROWS: SubscriptionModelMatrixRow[] = [
  {
    label: "NanoBanana",
    tiers: tierBools(IMAGE_MIN_RANK.nano),
  },
  {
    label: "NanoBanana Pro",
    tiers: tierBools(IMAGE_MIN_RANK.pro),
  },
  {
    label: "Seedream 4.5",
    tiers: tierBools(IMAGE_MIN_RANK.pro),
  },
  {
    label: "Seedream 5.0",
    tiers: tierBools(IMAGE_MIN_RANK.pro),
  },
  {
    label: "Seedance 1.5",
    tiers: tierBools(VIDEO_MIN_RANK["bytedance/seedance-1.5-pro"]),
  },
  { label: "Kling 2.6", tiers: tierBools(VIDEO_MIN_RANK["kling-2.6/video"]) },
  { label: "Seedance 2.0", tiers: tierBools(VIDEO_MIN_RANK["bytedance/seedance-2.0-pro"]) },
  {
    label: "Veo 3.1 Fast",
    tiers: tierBools(VIDEO_MIN_RANK.veo3_fast),
  },
  {
    label: "Kling 3.0",
    tiers: tierBools(VIDEO_MIN_RANK["kling-3.0/video"]),
  },
  { label: "Veo 3.1", tiers: tierBools(VIDEO_MIN_RANK.veo3) },
  {
    label: "Sora 2",
    tiers: tierBools(VIDEO_MIN_RANK["openai/sora-2"]),
  },
  {
    label: "Sora 2 Pro",
    tiers: tierBools(VIDEO_MIN_RANK["openai/sora-2-pro"]),
  },
  {
    label: "Motion Control",
    tiers: tierBools(VIDEO_MIN_RANK["kling-3.0/video"]),
  },
];
