"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LayoutList,
  Loader2,
  Pencil,
  Plus,
  Smartphone,
  Package2,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ElementMentionTextarea, {
  type MentionElementOption,
  type MentionElementTabConfig,
} from "@/app/_components/ElementMentionTextarea";
import { PromptEnhanceCornerButton } from "@/app/_components/PromptEnhanceCornerButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { studioSelectContentClass, studioSelectItemClass } from "@/app/_components/StudioModelPicker";
import { SEEDANCE_PRO_PROMPT_MAX_CHARS, type PiapiSeedanceAspectRatio } from "@/lib/piapiSeedance";
import { useCreditsPlan, getPersonalApiKey, getPersonalPiapiApiKey } from "@/app/_components/CreditsPlanContext";
import { compressImageFileForUpload } from "@/lib/compressImageFileForUpload";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { STUDIO_IMAGE_FILE_ACCEPT } from "@/lib/studioUploadValidation";
import { cn } from "@/lib/utils";
import { calculateVideoCreditsForModel } from "@/lib/pricing";
import { AdsStudioRefSourceDialog } from "@/app/_components/AdsStudioRefSourceDialog";
import type { AdsStudioMentionEntry } from "@/app/_components/AdsStudioMentionMenu";
import { loadAvatarUrls } from "@/lib/avatarLibrary";
import { logGenerationFailure, userMessageFromCaughtError } from "@/lib/generationUserMessage";

/** Ads Studio: PiAPI Seedance 2 (non–fast) only. */
const ADS_STUDIO_SEEDANCE_MODEL = "bytedance/seedance-2" as const;

/** Tutorial (2) bundled refs: Seedance @image1 → product slot, @image2 → avatar slot (public/studio/ads-studio/). */
const ADS_STUDIO_TUTORIAL_2_AVATAR_PATH = "/studio/ads-studio/tutorial-2-avatar.png";
const ADS_STUDIO_TUTORIAL_2_PRODUCT_PATH = "/studio/ads-studio/tutorial-2-product.png";

/** Unboxing “Recreate” bundled refs: @image1 product/unboxing scene, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_UNBOXING_PRODUCT_PATH = "/studio/ads-studio/unboxing-recreate-product.png";
const ADS_STUDIO_UNBOXING_AVATAR_PATH = "/studio/ads-studio/unboxing-recreate-avatar.png";

/** Unboxing (2) “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_UNBOXING_2_PRODUCT_PATH = "/studio/ads-studio/unboxing-2-product.png";
const ADS_STUDIO_UNBOXING_2_AVATAR_PATH = "/studio/ads-studio/unboxing-2-avatar.png";

/** Unboxing (3) “Recreate”: product still only (no bundled avatar; public/studio/ads-studio/). */
const ADS_STUDIO_UNBOXING_3_PRODUCT_PATH = "/studio/ads-studio/unboxing-3-product.png";

/** Unboxing (4) “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_UNBOXING_4_PRODUCT_PATH = "/studio/ads-studio/unboxing-4-product.png";
const ADS_STUDIO_UNBOXING_4_AVATAR_PATH = "/studio/ads-studio/unboxing-4-avatar.png";

/** App template `0504 (1)` (bare) Recreate: @image1 app UI, @image2 avatar — not `0504 (1)(N)` (public/studio/ads-studio/). */
const ADS_STUDIO_APP_0504_BASE_1_APP_PATH = "/studio/ads-studio/app-0504-base-1-app.png";
const ADS_STUDIO_APP_0504_BASE_1_AVATAR_PATH = "/studio/ads-studio/app-0504-base-1-avatar.png";

/** App template `0504 (1)(1)` Recreate: @image1 web UI, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_APP_0504_1_1_APP_PATH = "/studio/ads-studio/app-0504-1-1-app.png";
const ADS_STUDIO_APP_0504_1_1_AVATAR_PATH = "/studio/ads-studio/app-0504-1-1-avatar.png";

/** App template `0504 (1)(4)` Recreate: @image1 app UI, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_APP_0504_1_4_APP_PATH = "/studio/ads-studio/app-0504-1-4-app.png";
const ADS_STUDIO_APP_0504_1_4_AVATAR_PATH = "/studio/ads-studio/app-0504-1-4-avatar.png";

/** App template `0504 (1)(5)` Recreate: @image1 app UI, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_APP_0504_1_5_APP_PATH = "/studio/ads-studio/app-0504-1-5-app.png";
const ADS_STUDIO_APP_0504_1_5_AVATAR_PATH = "/studio/ads-studio/app-0504-1-5-avatar.png";

/** App template `0504 (1)(6)` Recreate: @image1 app UI, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_APP_0504_1_6_APP_PATH = "/studio/ads-studio/app-0504-1-6-app.png";
const ADS_STUDIO_APP_0504_1_6_AVATAR_PATH = "/studio/ads-studio/app-0504-1-6-avatar.png";

/** App template `0504 (1)(7)` Recreate: @image1 app UI, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_APP_0504_1_7_APP_PATH = "/studio/ads-studio/app-0504-1-7-app.png";
const ADS_STUDIO_APP_0504_1_7_AVATAR_PATH = "/studio/ads-studio/app-0504-1-7-avatar.png";

/** App template `0504 (1)(8)` Recreate: @image1 app UI, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_APP_0504_1_8_APP_PATH = "/studio/ads-studio/app-0504-1-8-app.png";
const ADS_STUDIO_APP_0504_1_8_AVATAR_PATH = "/studio/ads-studio/app-0504-1-8-avatar.png";

/** App template `0504 (1)(10)` Recreate: @image1 app UI, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_APP_0504_1_10_APP_PATH = "/studio/ads-studio/app-0504-1-10-app.png";
const ADS_STUDIO_APP_0504_1_10_AVATAR_PATH = "/studio/ads-studio/app-0504-1-10-avatar.png";

/** UGC Virtual Try On 2 “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_VIRTUAL_TRY_ON_2_PRODUCT_PATH = "/studio/ads-studio/virtual-try-on-2-product.png";
const ADS_STUDIO_VIRTUAL_TRY_ON_2_AVATAR_PATH = "/studio/ads-studio/virtual-try-on-2-avatar.png";

/** UGC Try On 3 “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_TRY_ON_3_PRODUCT_PATH = "/studio/ads-studio/ugc-try-on-3-product.png";
const ADS_STUDIO_TRY_ON_3_AVATAR_PATH = "/studio/ads-studio/ugc-try-on-3-avatar.png";

/** UGC Try On 4 “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_TRY_ON_4_PRODUCT_PATH = "/studio/ads-studio/ugc-try-on-4-product.png";
const ADS_STUDIO_TRY_ON_4_AVATAR_PATH = "/studio/ads-studio/ugc-try-on-4-avatar.png";

/** UGC Try On 5 “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_TRY_ON_5_PRODUCT_PATH = "/studio/ads-studio/ugc-try-on-5-product.png";
const ADS_STUDIO_TRY_ON_5_AVATAR_PATH = "/studio/ads-studio/ugc-try-on-5-avatar.png";

/** Generic UGC Try On (street prompt) — @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_UGC_TRY_ON_STREET_PRODUCT_PATH = "/studio/ads-studio/ugc-try-on-product.png";
const ADS_STUDIO_UGC_TRY_ON_STREET_AVATAR_PATH = "/studio/ads-studio/ugc-try-on-avatar.png";

/** Default Tutorial (blender) — not Tutorial (2). Bundled stills instead of template preview frames. */
const ADS_STUDIO_TUTORIAL_STANDARD_AVATAR_PATH = "/studio/ads-studio/tutorial-standard-avatar.png";
const ADS_STUDIO_TUTORIAL_STANDARD_PRODUCT_PATH = "/studio/ads-studio/tutorial-standard-product.png";

/** Pro Try On — product still + avatar (not first frame of template preview). */
const ADS_STUDIO_PRO_TRY_ON_AVATAR_PATH = "/studio/ads-studio/pro-try-on-avatar.png";
const ADS_STUDIO_PRO_TRY_ON_PRODUCT_PATH = "/studio/ads-studio/pro-try-on-product.png";

/** UGC 2 “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_UGC_2_PRODUCT_PATH = "/studio/ads-studio/ugc-2-product.png";
const ADS_STUDIO_UGC_2_AVATAR_PATH = "/studio/ads-studio/ugc-2-avatar.png";

/** UGC 3 “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_UGC_3_PRODUCT_PATH = "/studio/ads-studio/ugc-3-product.png";
const ADS_STUDIO_UGC_3_AVATAR_PATH = "/studio/ads-studio/ugc-3-avatar.png";

/** UGC 4 “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_UGC_4_PRODUCT_PATH = "/studio/ads-studio/ugc-4-product.png";
const ADS_STUDIO_UGC_4_AVATAR_PATH = "/studio/ads-studio/ugc-4-avatar.png";

/** UGC 5 “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_UGC_5_PRODUCT_PATH = "/studio/ads-studio/ugc-5-product.png";
const ADS_STUDIO_UGC_5_AVATAR_PATH = "/studio/ads-studio/ugc-5-avatar.png";

/** UGC 6 “Recreate”: @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_UGC_6_PRODUCT_PATH = "/studio/ads-studio/ugc-6-product.png";
const ADS_STUDIO_UGC_6_AVATAR_PATH = "/studio/ads-studio/ugc-6-avatar.png";

/** UGC Woman (`ugc` template label) — @image1 product, @image2 avatar (public/studio/ads-studio/). */
const ADS_STUDIO_UGC_WOMAN_PRODUCT_PATH = "/studio/ads-studio/ugc-woman-product.png";
const ADS_STUDIO_UGC_WOMAN_AVATAR_PATH = "/studio/ads-studio/ugc-woman-avatar.png";

function resolveAdsStudioPublicImage(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).href;
}

type AdsStudioRunGenerateRefOverride = {
  appRefUrl: string;
  avatarUrl: string;
  assetType: "product" | "app";
};

const ADS_STUDIO_DURATION_MIN = 4;
const ADS_STUDIO_DURATION_MAX = 15;
const ADS_STUDIO_DURATION_CHOICES = Array.from(
  { length: ADS_STUDIO_DURATION_MAX - ADS_STUDIO_DURATION_MIN + 1 },
  (_, i) => ADS_STUDIO_DURATION_MIN + i,
);

const ADS_STUDIO_SEEDANCE_ASPECTS = [
  "auto",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "1:1",
  "21:9",
] as const satisfies readonly PiapiSeedanceAspectRatio[];

type AdsStudioOutputAspect = (typeof ADS_STUDIO_SEEDANCE_ASPECTS)[number];

const ADS_STUDIO_SEEDANCE_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
type AdsStudioVideoResolution = (typeof ADS_STUDIO_SEEDANCE_RESOLUTIONS)[number];

type AdsStudioHistoryItem = {
  id: string;
  createdAt: number;
  assetType: "product" | "app";
  prompt: string;
  /** Sidebar / list thumbnail (often product or single ref). */
  imageUrl?: string;
  videoUrl?: string;
  /** When both refs were used at generation time (older rows may omit these). */
  productRefUrl?: string;
  avatarRefUrl?: string;
};

type AdsStudioJobPhase = "submitting" | "rendering" | "failed";

type AdsStudioActiveJob = {
  id: string;
  createdAt: number;
  phase: AdsStudioJobPhase;
  promptSnippet: string;
  thumbUrl?: string;
  error?: string;
  /** PiAPI task id — polling can resume after reload */
  taskId?: string;
  /** Full prompt + refs for the history row when the remote render completes */
  promptFull?: string;
  jobAssetType?: "product" | "app";
  previewStillUrl?: string;
  productRefUrl?: string;
  avatarRefUrl?: string;
};

/** Sidebar project popup: history row or in-flight job (id only — resolve from `history` / `activeJobs`). */
type AdsStudioProjectDetail = { kind: "history"; id: string } | { kind: "job"; id: string };

const LS_ADS_STUDIO_HISTORY = "ugc_ads_studio_history_v1";
const LS_ADS_STUDIO_ACTIVE_JOBS = "ugc_ads_studio_active_jobs_v1";
/** Composer draft (prompt + refs + settings), same idea as `ugc_studio_video_create_draft_v1`. */
const LS_ADS_STUDIO_COMPOSER_DRAFT_V1 = "ugc_ads_studio_composer_draft_v1";

const ADS_STUDIO_RESOLUTION_SET = new Set<string>(ADS_STUDIO_SEEDANCE_RESOLUTIONS);

function isHttpsOrHttpUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\//i.test(t);
}

/** Allow same-origin `/uploads/...` paths saved from older upload fallbacks. */
function isAdsStudioStoredMediaUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  return t.startsWith("/") && !t.startsWith("//");
}

function pickOptionalTrimmedString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const t = c.trim();
    if (t) return t;
  }
  return undefined;
}

function sanitizeAdsStudioHistoryRows(raw: unknown): AdsStudioHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AdsStudioHistoryItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const x = row as Record<string, unknown>;
    if (typeof x.id !== "string" || !x.id.trim()) continue;
    const createdAt =
      typeof x.createdAt === "number" && Number.isFinite(x.createdAt) ? x.createdAt : Date.now();
    const videoRaw = pickOptionalTrimmedString(x.videoUrl, x.clipUrl, x.outputUrl, x.resultUrl);
    const videoUrl = videoRaw && isAdsStudioStoredMediaUrl(videoRaw) ? videoRaw : undefined;
    const imageRaw = pickOptionalTrimmedString(x.imageUrl, x.thumbUrl, x.previewUrl);
    const imageUrl = imageRaw && isAdsStudioStoredMediaUrl(imageRaw) ? imageRaw : undefined;
    const pr = pickOptionalTrimmedString(x.productRefUrl);
    const productRefUrl = pr && isAdsStudioStoredMediaUrl(pr) ? pr : undefined;
    const ar = pickOptionalTrimmedString(x.avatarRefUrl);
    const avatarRefUrl = ar && isAdsStudioStoredMediaUrl(ar) ? ar : undefined;
    out.push({
      id: x.id.trim(),
      createdAt,
      assetType: x.assetType === "app" ? "app" : "product",
      prompt: typeof x.prompt === "string" ? x.prompt : "",
      imageUrl,
      videoUrl,
      productRefUrl,
      avatarRefUrl,
    });
  }
  return out.slice(0, 24);
}

function resolveAdsStudioPlaybackUrl(raw: string | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (t.startsWith("/") && typeof window !== "undefined") {
    try {
      return new URL(t, window.location.origin).href;
    } catch {
      return t;
    }
  }
  return t;
}

function safeAdsStudioComposerDuration(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 15;
  return Math.min(ADS_STUDIO_DURATION_MAX, Math.max(ADS_STUDIO_DURATION_MIN, Math.round(n)));
}

function safeAdsStudioOutputAspect(raw: unknown): AdsStudioOutputAspect {
  const s = typeof raw === "string" ? raw.trim() : "";
  return (ADS_STUDIO_SEEDANCE_ASPECTS as readonly string[]).includes(s) ? (s as AdsStudioOutputAspect) : "9:16";
}

function safeAdsStudioVideoResolution(raw: unknown): AdsStudioVideoResolution {
  const s = typeof raw === "string" ? raw.trim() : "";
  return ADS_STUDIO_RESOLUTION_SET.has(s) ? (s as AdsStudioVideoResolution) : "720p";
}
/** Drop persisted jobs older than this so stale rows do not poll forever */
const ADS_STUDIO_MAX_ACTIVE_JOB_AGE_MS = 1000 * 60 * 60 * 24;

/** PiAPI / provider can take a long time; client used to cap at ~3 min and marked jobs failed incorrectly. */
const ADS_STUDIO_VIDEO_POLL_MAX_MS = 2 * 60 * 60 * 1000; // 2 hours
const ADS_STUDIO_VIDEO_POLL_INTERVAL_MS = 2000;

type TemplateVideoItem = { filename: string; label: string; url: string };

type AdsStudioTemplateGalleryKind = "product" | "app";

const TEMPLATE_PROMPT_HYPER_MOTION = `chocolate japanese style commercial, with chocolate crunching, pieces breaking, hands passing chocolate to each other, japanese happy people smiling while biting, and these little characters animated`;

const TEMPLATE_PROMPT_UNBOXING = `VIDEO — 10-second vertical (9:16) satisfying ASMR unboxing of "FROGGY PRINCE" by "MELON STUDIO × PLAY PALS"
Product: A cute vinyl art toy figure — a chubby character wearing a green frog costume hoodie with a small red felt crown on top. Big black sparkly eyes with white star highlights, rosy pink cheeks, open happy smile. Orange bow tie, red heart on the belly, white boots with red heart details. Comes in a square pastel-yellow box with green lid, plus collectible art cards.
Format: Overhead top-down camera looking straight down at a light wooden desk surface. Only hands visible — female hands, short natural nails, cozy oversized sage-green sweater sleeves. Warm soft natural lighting from a window on the left. Slow, deliberate, ASMR-style movements.
Scene 1 — Box Tap + Open (0–3s): The sealed yellow-and-green square box sits centered on the wooden desk. The illustrated Froggy Prince character is visible on the front — a cute kid in a frog hoodie with "Froggy Prince" in playful green cursive and "MELON STUDIO × PLAY PALS" below. Fingers tap the box lid three times — satisfying hollow cardboard thuds. Then both hands grip the green lid and lift it straight up slowly — revealing white tissue paper inside with a small round green sticker seal. The lid is placed to the right.
Scene 2 — Tissue Peel + Figure Reveal (3–6s): Fingers peel the green sticker seal (satisfying crisp peel sound), then pull the tissue paper apart to reveal the Froggy Prince figure nestled in a shaped foam insert. A brief pause — the figure sits snugly in its cutout, the red felt crown, glossy green body, and pink cheeks immediately visible. One hand lifts the figure out gently, holds it up at center frame, and rotates it slowly — showing the front face (big star eyes, open smile), the orange bow tie, the red heart on the belly, and the little white boots. The vinyl surface catches the warm light with a soft glossy sheen.
Scene 3 — Cards + Final Display (6–10s): The figure is placed standing upright on the desk. Hands reach back into the box and pull out two square art cards stacked together. The first card (orange background, sparkle details) is slid to the left — showing the illustrated Froggy Prince character with "FROGGY PRINCE" in bold blue retro text. The second card (pink background, heart frame) is slid to the right — showing the character inside a rainbow heart. Both cards are tapped once into alignment on the desk. Final arrangement: the figure standing center on the wooden desk, the open box behind it, the green lid leaning against the box showing the illustrated front, both art cards fanned in front. Hands pull away. Hold the beauty shot for 1.5 seconds — warm light, cozy desk, the little frog prince smiling at camera.
Overall style: Cozy ASMR unboxing for Xiaohongshu/TikTok. Top-down overhead, no face, only hands. Every sound is crisp and amplified: cardboard tap, sticker peel, tissue rustle, vinyl figure lifted from foam, cards sliding on wood. No music — pure ASMR sounds only. Warm natural daylight, light wooden surface, sage-green sweater sleeves for color harmony with the frog character. Slow, satisfying, tactile. Vertical 9:16. Designer toy collector aesthetic.`;

const TEMPLATE_PROMPT_UGC = `Vertical 9:16 selfie-style UGC tennis racket review, shot on iPhone front and back camera mix, natural daylight on an outdoor tennis court, handheld authentic energy, casual "showing a friend my new racket" vibe, warm natural light, real skin tones, no filters
An outdoor tennis court — green or blue hard court surface with white lines, a net visible in the background, natural daylight, open sky above. The young woman wears a bright lime green tennis outfit — a fitted lime green sleeveless tennis dress or matching lime green tennis top and skirt, the vivid green a striking contrast against the mint green and orange of the AURA 300 racket; she holds the SERA AURA 300 tennis racket — mint green to white gradient frame, orange cross-string pattern through the white string face, white perforated grip tape, AURA 300 lettering on the shaft, a mint green butt cap at the handle end.
Action and dialogue sequence:
She holds the AURA 300 up to the front camera with one hand, the full racket face filling the vertical frame, her bright lime green sleeve visible at the edge of the frame, the mint green frame and the orange string pattern sharp in the daylight: she tilts it slowly catching the sun across the surface, speaking naturally: "Okay so this just arrived and I am obsessed with the color." She flips it to show the back face, then tilts to show the mint-to-white gradient on the shaft where AURA 300 is printed, the lime green of her outfit creating a vivid color contrast beside the racket.
She switches to the back camera. Holds the racket out at arm's length, the lime green dress visible in the frame, and bounces the racket lightly on her palm: "It feels really balanced, like not too heavy." She brings the racket close to the back lens so the orange cross-string pattern fills the frame — the individual string intersections sharp, the orange against white vivid in the open daylight.
She props the phone against her bag or the court fence pointing toward her. She bounces a ball and hits two slow controlled groundstrokes toward the net — the bright lime green outfit and the mint AURA 300 frame moving through the frame together on each swing, the two greens catching the daylight differently, the racket head tracking cleanly through the air. She picks the phone back up.
Close-up back camera shot — she holds the racket face close to the lens, the orange string mesh filling the vertical frame, then slowly pans down the shaft past the AURA 300 lettering to the white grip tape, her lime green sleeve visible at the top of the frame, her fingers wrapping the grip naturally: "And the grip feels so good, really clean." She holds the full racket up one final time beside her face on the front camera — bright lime green outfit, mint green racket, orange strings — smiles directly into the lens: "Yeah. Yeah this is the one."`;

const TEMPLATE_PROMPT_UGC_2 = `Vertical 9:16 selfie-style UGC phone case review, shot on iPhone front and back camera mix, warm natural indoor light, soft cozy energy, casual "showing a friend my new case" vibe, real skin tones, no filters, intimate low-key mood
A bright casual room — warm natural light from the side, a clean surface or bed behind her, soft and cozy atmosphere. The young woman holds the clear glitter liquid phone case — a transparent hard shell case with a rainbow iridescent border trim, filled with liquid glitter and confetti stars in pastel and holographic colors, and a collection of tiny 3D charms resting at the bottom: two yellow smiley face emojis, a white unicorn, a blue car, a pink car, a purple car, a yellow rubber duck, a green cactus, a blue dinosaur — all floating and shifting when the case moves.
Action and dialogue sequence:
She holds the case up to the front camera with both hands, the clear front facing the lens, the rainbow border catching the warm room light: she says nothing for a beat — just slowly tilts the case left, and all the tiny charms and glitter drift together to the side in the liquid. She tilts it right, they drift back. She looks at the camera with wide eyes: "Wait. Wait look at this."
She tilts the case again slowly, the camera close on the front face, the charms tumbling through the glitter liquid in slow motion — the smiley faces, the unicorn, the rubber duck all visible shifting through the holographic confetti stars. She brings it even closer to the front lens so the charms fill the frame: "There is a dinosaur in here. And a duck. WHY is there a duck."
She switches to the back camera, holds the case flat and then tips it vertically — the charms and glitter cascade downward through the liquid in a slow satisfying drift, the rainbow border glowing in the warm light, the holographic stars catching every shift of light. She tilts it back the other way, the whole contents drifting again: "I cannot stop doing this."
She props the phone and holds the case up with both hands, shaking it gently — the glitter and charms swirl in all directions, the liquid catching the light in shifting rainbow patches, the tiny 3D charms tumbling through. She looks at the camera, shakes it once more slowly: "This is genuinely the most satisfying thing I own right now." She holds it still beside her face on the front camera, the rainbow border glowing, smiles directly into the lens: "That's it. That's the review."`;

const TEMPLATE_PROMPT_UGC_3 = `Vertical 9:16 UGC sneaker unboxing and review, shot on iPhone front and back camera mix, bright natural daylight from a window, casual bedroom energy, handheld selfie perspective, real skin tones, no filters, fun and expressive creator vibe
A bright casual bedroom or living room — natural daylight from the side, a clean floor space visible, the pair of FUNNY STEPS sneakers sitting on the floor or a surface in front of her — multicolor upper panels in blue mesh, orange, green, yellow and purple leather panels, white laces with multicolored eyelets, a FUNNY STEPS logo tab on the tongue and side, and a clear transparent air bubble sole filled with tiny 3D charms and confetti pieces — miniature teddy bears, stars, colorful shapes all visible floating inside the sole.
Action and dialogue sequence:
She picks up one sneaker with both hands and holds it directly to the front camera lens, the clear sole facing the lens so all the tiny charms inside are visible through the transparent bubble: she tilts it slowly and the charms shift and tumble inside the sole. Her eyes go wide directly at camera: "There are TOYS in the sole. Actual tiny toys." She tilts it the other way, the charms drifting again, the colored confetti pieces catching the daylight inside the bubble.
She switches to the back camera, holds the sneaker sole-up close to the lens — the clear bubble sole fills the vertical frame, all the tiny teddy bears and stars and colorful shapes sharp through the transparent material, pressing against the inside of the sole as she tips it: "A little bear. There is a little bear in there." She taps the sole gently with one finger and the charms bounce inside.
She sets the phone down propped against something, sits on the floor and pulls both sneakers on — lacing them quickly, the multicolor panels and white laces visible on her feet. She stands up, picks the phone up and points the back camera down at her feet: both FUNNY STEPS sneakers on the floor, the clear charm-filled soles visible from above, the rainbow of blue orange green yellow purple panels bright in the daylight. She stomps one foot lightly and the charms bounce inside the sole.
She brings the front camera back up to face level, holds one sneaker up beside her face — the multicolor upper and the clear charm sole both visible — looks directly into the lens, completely genuine: "I am twenty years old and these are my favorite shoes I have ever owned." She holds the sneaker up one final time so the clear sole faces the camera, tilts it once more slowly, the tiny toys drifting inside: "You are welcome."`;

const TEMPLATE_PROMPT_UGC_4 = `Shot on iPhone front camera, vertical 9:16, natural HDR, slight exposure shifts, real skin tones, authentic UGC creator energy, warm indoor natural light
A bright casual room — warm natural light from the side, a clean desk surface with the ATELIER INK 12 CORE colors set in its clear transparent plastic case, the colorful marker caps visible through the case walls, a white sketchpad open beside it. A young woman sits close to the front camera, relaxed and natural, speaking slowly and genuinely.
Action and dialogue sequence:
She picks up the full ATELIER INK clear case with both hands and holds it up to the front camera, the 12 colorful caps facing the lens, the label readable. She looks at it for a beat — then at the camera: "Okay I need to show you these." She sets the case down, pulls out the green G04 marker, uncaps it slowly, sniffs the tip, pauses. Looks at camera: "Why does it smell like that." Genuine. Unhurried.
She opens the sketchpad and draws a slow deliberate star with the green marker. Holds the paper up to the lens. Says nothing for a beat — just lets the color speak. Then quietly: "That color is insane." She picks up the cobalt blue B17, draws beside the green. Holds it up again. "The pigment is so good."
She sets the paper down. Looks directly into the camera. Taps the marker cap slowly against her lip. One breath. Then: "Honestly — if you draw, if you doodle — just get these." She lifts the full clear case up to the lens, all 12 caps facing camera. Holds it there. Smiles slowly. Says nothing. Then: "That's it. That's the review."`;

const TEMPLATE_PROMPT_UNBOXING_2 = `Style: UGC, gym vlog, iPhone front camera, real effort, natural energy

A young girl is filming herself in a modern aesthetic gym, people training in the background.

Shot on iPhone front camera, vertical 9:16, slight shake, real gym lighting, no grading.

She is pedaling on a pastel stationary bike, already slightly tired.

She is breathing heavily and speaking directly while working out.

“Okay… I thought this was gonna be easy…”
(breathing heavily)
“It’s not.”
She laughs.
“But it’s actually so good.”`;

const TEMPLATE_PROMPT_UGC_TRY_ON_2 = `dynamic`;

const TEMPLATE_PROMPT_TUTORIAL = `A 15-second vertical UGC product review video, iPhone aesthetic. The girl is reviewing and demonstrating the blender — not teaching a recipe. She's excited about the product itself.
⚡ 0–2s — HOOK: Girl holds the dark charcoal green blender base close to camera with both hands, eyes wide, says straight into lens: "This blender just changed my morning routine."
2–5s: She runs her finger along the matte dark body, taps the single round green dial knob, then spins it slowly — small copper LED dots light up around it. She tilts her head impressed: "One knob. That's literally all you need."
5–8s: She lifts the clear glass jar, knocks on it with her knuckle — solid sound — and shows the blade assembly underneath: "Glass jar, not plastic. You can actually see everything inside."
8–11s: She locks the jar onto the base with a satisfying click, loads fruits in, presses the dial — blender fires up instantly. She steps back and gestures at it like "look at this thing": "Hear how quiet that is?"
11–13s: She pours the smoothie, holds the glass up to the light — vibrant color, smooth texture: "First try. No chunks."
13–15s: Takes a sip, looks at the blender, then back to camera with a nod: "Yeah. Worth it."
Style: Raw UGC product review, vertical 9:16, warm natural light, clean kitchen counter, blender always in frame, handheld shaky cam, no text overlays.`;

const TEMPLATE_PROMPT_TUTORIAL_2 = `Authentic amateur-style UGC in a bright bathroom: white tiles, soft natural daylight from a window, real-life details (folded towel, small plant, simple ceramics). Handheld feel with subtle micro-shake, natural smartphone-lens look, no cinematic grading. Feels like a real girl filming a quick clip for friends. The phone, camera, and any mirror reflection of a phone or hands holding a phone must never be visible. No mirrors showing the filming setup at all — if a mirror appears, it only shows her face and the room, never a device.
0–2s — Visual hook: Extreme close-up of the girl's face, slightly off-center, lit by soft window light. She leans in fast with wide surprised eyes and a half-smile, like she just noticed something amazing on her skin. Natural ambient sound: faint water drip + her soft excited "okay wait—". Tiny handheld wobble. No on-screen text.
2–4s: Quick cut — her hand brings [PRODUCT] up next to her cheek, turning it once so the label catches the light. She says in casual upbeat American English: "I literally cannot believe how good this is."
4–7s: Tight close-up of her hands applying [PRODUCT] to her skin — real texture, real motion, product visibly going on. Soft bathroom room tone. Voiceover: "Look how it just melts in — my skin already feels insane."
7–10s: Medium shot of her face and shoulders, soft daylight, she touches the area where she applied it and turns her face gently side to side in the light to show the glow. Small natural giggle. Says: "Okay, I'm obsessed. I'm not going back."
10–12s: Final close-up: both hands hold [PRODUCT] up near her face, she gives a small playful shrug and a genuine smile, clip ends mid-motion like a real social post.
Audio: Only her voice + natural bathroom room tone (faint water, soft tile echo). No music, no sound effects, no narrator. Voice: warm, friendly, mid-20s American accent, conversational, natural breaths and pauses, never stiff or over-rehearsed.`;

const TEMPLATE_PROMPT_UGC_5 = `HOOK (0–2 sec) POV handheld shot, slightly shaky. A bright red shopping bag with gold text "MAISON BRUNÉ" gets tossed onto a white unmade bed from above — lands with a satisfying thud, tissue paper rustling. Natural bedroom lighting, warm tones. Authentic, raw, no tripod.
JUMP CUT 1 (2–4 sec) Close-up hands grabbing the red bag handles, pulling it closer. Camera slightly out of focus then snaps sharp. Nail polish, casual outfit visible at edges. Breathing audible.
JUMP CUT 2 (4–7 sec) Hands pull out the pink dustbag — "MAISON BRUNÉ PARIS" printed in rose. Fabric sliding sound. Slow squeeze of the dustbag, then quick reveal yank.
JUMP CUT 3 (7–12 sec) Tan pebbled leather tote bag drops onto the bed in full frame. Gold chain strap clinks and settles. Camera circles product quickly — chaotic but intentional. Natural window light catches the gold hardware.
JUMP CUT 4 (12–18 sec) Extreme close-up: fingers running across the grainy leather texture. Gold lobster clasp swings. Chain strap draped over hand — slow pan up arm.
OUTRO (18–22 sec) Bag held up toward camera with both hands — full reveal. Slight smile reflected in mirror behind. Red shopping bag and pink dustbag visible on bed in background.`;

const TEMPLATE_PROMPT_UNBOXING_3 = `A 15-second vertical (9:16) ASMR-style jewelry unboxing video. Top-down overhead camera angle throughout. The surface is draped in soft white silk or satin fabric with gentle folds and creases creating elegant light and shadow. Soft diffused natural daylight, warm tone. No text overlays, no logos, no branding. Silent visual ASMR — slow, theatrical, satisfying.
0–3s: A striking matte red square gift box sits centered on the white silk. The box has a theatrical design — on the lid, a silver heart-shaped clasp with a keyhole in the center, surrounded by four small decorative square patches with graphic black-and-white optical patterns (stripes, sunbursts). A white satin ribbon trails loosely from under the box across the silk. Her hands (natural nails, no polish, one thin gold ring) enter frame from the bottom and gently touch the sides of the box, fingers tracing the heart clasp. She slowly turns the heart clasp — it clicks open with a satisfying motion.
3–7s: She opens the box — but it doesn't open like a normal lid. The box unfolds outward like a book or a theater stage, the front panel swinging open on a hinge to reveal an elaborate inner scene. Inside is a miniature diorama: a deep navy blue backdrop painted with gold shooting stars and pink paper-cut clouds at the bottom — like a tiny magical night sky theater. In the center of this scene, suspended on a small hook, hangs a single delicate silver chain necklace with a small silver key pendant. The key has a heart-shaped bow at the top. The diorama catches the light — gold foil stars shimmer, the pendant slowly sways. Her hands pause, letting the viewer take in the reveal.
7–10s: She carefully unclips the necklace from its display hook inside the diorama. She lifts it out slowly — the thin silver chain catches the light as it rises from the blue backdrop. She drapes the necklace across her open palm over the white silk, the key pendant dangling between her fingers. She turns her hand slightly so the pendant rotates and catches the light from different angles — the silver gleams against her skin.
10–13s: She lays the necklace down on the white silk in a gentle S-curve. She picks up the open box and tilts it toward camera — showing off the inner diorama scene one more time: the navy sky, gold stars, pink clouds, the tiny text at the bottom reading "you are the key." The box's theatrical pop-up construction is visible — layered paper-cut elements creating depth.
13–15s: Final flatlay — the open red box sits at the top of frame, its diorama interior visible like a tiny stage. The silver key necklace lies on the white silk below in an elegant curve. The white ribbon trails diagonally across the frame. Her hand gently adjusts the pendant one last time, then slowly pulls away. The silk catches a gentle highlight. Hold. End.
Style: Aesthetic jewelry unboxing / visual ASMR. Overhead POV, only hands visible. The star of the video is the packaging — a theatrical, interactive box that opens like a storybook to reveal a miniature paper-cut diorama scene, making the unboxing feel like unlocking a tiny magical world. One single jewelry piece inside — the reveal is slow and dramatic. Color palette: matte red box, navy blue interior, gold foil accents, pink paper clouds, silver jewelry, pure white silk background. The contrast between the white silk and red box is bold and eye-catching. Intimate, luxurious, deeply satisfying, gift-worthy. No brand names visible anywhere.`;

const TEMPLATE_PROMPT_UGC_TRY_ON_4 = `A 15-second vertical (9:16) UGC try-on video filmed on a smartphone. A young East Asian woman with long dark wavy hair stands in a bright modern apartment — light wood kitchen, full-length arched mirror, indoor plants, natural daylight. Handheld selfie energy, warm authentic tones.
0–4s: She faces the mirror in a simple base layer (tank top and shorts). She holds up the folded ribbed loungewear set — pale pink with tiny floral print — showing the pieces to camera, excited, checking the fabric in the light.
4–8s: Jump cuts as she changes into the matching long-sleeve henley-style top with small white buttons and lettuce-edge hem, then the matching shorts with the same ruffle trim and floral pattern. She smooths the outfit, adjusts her hair clip, turns side to side in the mirror.
8–12s: Full outfit on — head-to-toe mirror selfie. She steps back, does a slow confident spin, runs a hand along the ribbed texture of the sleeve, shows the relaxed silhouette and how the set moves.
12–15s: Final pose facing camera with a soft smile, hands in pockets or at her sides, holding the look. End on a clean mirror beat.
Style: Real UGC, natural texture, no logos, no text overlays.`;

const TEMPLATE_PROMPT_UGC_TRY_ON_5 = `A 15-second vertical (9:16) UGC try-on video filmed on a smartphone. A young woman with voluminous curly dark hair films herself in a bright minimalist bathroom — white walls, glass shower with warm brass fixtures, light wood floor, natural daylight. Handheld selfie energy, confident editorial vibe.
0–3s: She faces the mirror in a simple base outfit. She lifts the structured burgundy top-handle bag into frame — glossy wine-red leather, silver clasp — showing it to camera, turning it slowly so the light catches the grain and hardware.
3–7s: Jump cuts: she sets the bag on the vanity, then reveals a bold red ruched mini dress with a wide black studded belt and layered silver jewelry (chunky chain necklace, hoops, stacked bracelets, rings). She holds the dress up against herself, then transitions into wearing it, adjusting the belt and smoothing the ruching.
7–11s: Full look on — she picks up the burgundy bag, hooks it on her arm, checks angles in the mirror, does a slow turn to show silhouette, bag, and accessories together. Close beats on jewelry catching the light.
11–15s: Final hero pose: bag on shoulder, hands relaxed, confident neutral expression, slight hip shift. Hold, then a small smile. End clean.
Style: Authentic UGC, no brand text on screen, no logos in frame.`;

const TEMPLATE_PROMPT_UGC_TRY_ON_3 = `A 15-second vertical (9:16) UGC try-on video filmed on a smartphone. A young East Asian woman with a short black bob haircut stands in front of a full-length mirror in a minimalist bedroom — neutral beige walls, natural daylight from a window. Handheld selfie-style camera, authentic influencer energy, slightly warm tones.
0–3s: She faces the mirror camera wearing a simple white bathrobe or basic white tee and shorts. She holds up the outfit pieces on hangers — a black fitted top and a black-and-white striped mini skirt — showing them to camera with a "watch this" expression, raises an eyebrow playfully.
3–5s: Quick jump cut — she's now wearing the fitted black short-sleeve top with a mock neckline, slightly structured and tailored at the waist. She adjusts the hem, smoothing it down, turns side to side checking the fit in the mirror. The top has a clean minimal look — matte black fabric, cap sleeves, a subtle peplum-like shape at the waist.
5–8s: Another jump cut — she pulls on the black-and-white horizontal striped knit mini skirt, tugging it over her hips. The skirt is very short, body-con, sitting low on the waist just below the top's hem. She adjusts the waistband and does a quick spin to show the fit from all angles.
8–11s: Jump cut — now the full outfit is complete. She's added bright neon yellow opaque tights covering her legs entirely, and matching neon yellow pointed-toe stiletto pumps. She puts on a pair of retro oval sunglasses with yellow-amber tinted lenses. She steps back from the mirror to show the full look head to toe — black top, striped mini, yellow tights, yellow heels, yellow shades. She does a confident slow turn, hand on hip.
11–15s: She faces the mirror straight on, strikes a final pose — legs slightly apart, arms at her sides, chin slightly up, deadpan editorial expression through the yellow sunglasses. She holds the pose for a beat, then breaks into a small satisfied smile. She reaches toward the phone and the video cuts.
Style: Authentic UGC / TikTok try-on haul aesthetic. Quick jump cuts between each stage of getting dressed. Handheld slight camera shake. Natural bedroom lighting, no ring light. The outfit is the star — the contrast between the monochrome black-and-white top half and the bold neon yellow bottom half creates a striking graphic pop-art look. The vibe is effortlessly cool, editorial-meets-street, confident. No music specified. No text, no logos, no filters.`;

const TEMPLATE_PROMPT_UGC_TRY_ON_STREET = `A trendy 13-second vertical (3:4) street style fashion video filmed on a European cobblestone street with grey stone building facades. Shot on a smartphone in a raw, authentic influencer/TikTok style with fast dynamic cuts, varied camera angles, and natural daylight. The model is a stylish young Asian woman with dark hair pulled into a sleek bun, wearing retro cat-eye glasses, pearl drop earrings, and red nail polish.
Outfit: A burgundy-wine leather blazer with structured shoulders over a black corset top layered on a white collared shirt with a thin black tie. A short black bubble skirt (puffball mini). Sheer wine-red tinted tights. Black pointed-toe ankle-strap heels. A compact elongated burgundy leather bowling bag with silver chain detail and star-shaped charms hanging across the front.
Scene 1 — Accessory Tease (0–1.5s): Opens with a first-person POV shot from behind the camera — someone's hand extends into frame from the left, holding the burgundy bowling bag by its straps toward the model who stands a few meters away on the sidewalk in front of a stone building entrance with a dark glass door. The model reacts with an excited, surprised expression — mouth open, hands gesturing "give it to me." Camera is slightly low angle, handheld, casual. The bag is sharp in the foreground, the model slightly soft in the background.
Scene 2 — Detail Flatlay (1.5–3.5s): Cut to a top-down POV shot looking down at the ground. The model is sitting on the cobblestones — we see her legs in sheer wine tights and black pointed heels from above. The burgundy bag sits on the ground to the left. She holds a phone in her hand between her feet, scrolling through a photo of herself in the same outfit (a mirror-selfie style shot visible on the phone screen). Her other hand with burgundy nails rests near the phone. The composition is a casual "what's in my feed" moment. Camera is steady, overhead angle.
Scene 3 — Bag Pickup (3.5–5s): Close-up side angle shot at ground level. The model crouches down to pick up the bag from the cobblestones — we see her burgundy leather sleeve with white shirt cuff peeking out, her hand gripping the bag handles, the silver chain detail catching light. Her legs in tights and heels are visible in the background. Intimate detail shot emphasizing the bag texture and craftsmanship.
Scene 4 — Low Angle Power Shot (5–6.5s): Ultra-low angle shot from the ground looking up at the model. She towers over the camera confidently, the burgundy blazer and black corset framing the shot. The sky, building facade, and tree branches are visible behind her. Strong backlighting creates a slight lens flare. She has a confident, editorial expression, looking slightly down at camera.
Scene 5 — Walking Detail (6.5–7.5s): Side-angle close-up at knee height. The model bends down or walks, picking up / adjusting the bag. Focus on the leather blazer sleeve, bag handles, her hands, and the silver chain swinging. The stone wall provides a neutral textured backdrop. Natural motion blur.
Scene 6 — Portrait with Bag (7.5–9s): Medium close-up selfie-style angle. The model faces the camera, slightly turned, showing off the bag hanging from her arm. She holds the bag strap with one hand near her face, showing off her red nails and pearl earrings. Confident, slightly playful expression. The glass entrance door and stone columns are behind her. Natural daylight, warm tones.
Scene 7 — Walking Shot Profile (9–10.5s): Side profile tracking shot. The model walks past the stone building wall, bag on her shoulder. Her full outfit is visible — the burgundy blazer, black corset, bubble skirt, wine tights, pointed heels. The bag hangs perfectly at her side with the chain catching light. A green potted plant is visible near the entrance. She walks with purpose, slightly looking down. Cinematic, editorial feel.
Scene 8 — Full Body Pose (10.5–12s): Full body frontal shot. The model stands between stone columns, facing the camera directly. She raises both hands near her chin in a cute, playful gesture. The entire outfit is visible head to toe — glasses, blazer, corset, skirt, tights, heels, bag on shoulder. She shifts her weight slightly, posing naturally.
Scene 9 — Final Walk Away (12–13s): Three-quarter back/side tracking shot. The model walks away along the building, looking over her shoulder toward camera with a knowing glance. The bag is tucked under her arm. Sunlight catches the leather blazer. She moves with effortless cool energy. The video ends mid-stride.
Overall style: Raw, authentic street style content shot on smartphone. Fast cuts (1–2 seconds each). Mix of POV, close-up detail, low angle, and full body shots. Natural handheld camera movement with slight shake. Warm European daylight. Color palette dominated by burgundy/wine, black, and cool grey stone. Monochromatic outfit coordination — bag, blazer, tights, and nails all matching in wine tones. No text overlays, no filters. Upbeat background music (not generated). Fashion influencer energy — confident, playful, editorial yet casual.`;

const TEMPLATE_PROMPT_UGC_6 = `A young stylish female influencer  s in a cozy modern apartment with soft natural daylight. She records herself using the front camera of her phone (selfie mode), holding the phone in one hand and the AURA  Tumbler 40oz in the other. The camera has slight natural hand movement, casual framing, and feels real and unpolished.
She looks directly into the camera, relaxed and natural, like talking to a friend. While speaking, she casually rotates the tumbler, shows the handle and lid, lightly taps it, and takes a small sip.
Dialogue (natural, calm, ~15 sec):
"I’ve been using this tumbler every day lately, and I didn’t expect to like it this much.
My drinks stay cold literally all day, which is kind of crazy.
It doesn’t leak, it fits in my car, and the handle is actually super comfortable.
I just end up taking it with me everywhere now."`;

const TEMPLATE_PROMPT_UNBOXING_4 = `Man influencer  first opens the box  then takes the product with its packaging out of the box

Dialogue (quiet, impressed, natural):
"Okay… wow.
This is actually beautiful.
It feels… really refined.
Like, nothing extra — just clean, perfect details."

NO MUSIC, ONLY SFX`;

const TEMPLATE_PROMPT_APP_0504_1 = `10-sec TikTok UGC, 9:16, iPhone
0:00–0:03 | Selfie handheld, tall slim guy, green cap, beige fuzzy sweater, plaid shorts. He's standing outside on a street, a pink car parked behind him slightly out of focus. He looks at camera casually: "Bro I literally just rented this car in two minutes."
0:03–0:07 | He flips camera to show his phone screen — @image1, static, no scrolling — NOVARIDE app, map screen with pink car pins, the pink NOVA car card visible at the bottom. His thumb taps the "Book Now" button on screen. Then he pans the camera up from the phone to the actual pink car parked right there on the street. "Found it on the app, walked here, unlocked it. That's it."
0:07–0:10 | Camera flips back to his face. Slight smirk, nods. "Fifteen bucks an hour. I'm not giving this back." End.
Handheld selfie, outdoor daylight, urban street setting. He talks relaxed and low-energy — not selling, just showing. No text overlays, no TikTok UI, raw footage.`;

const TEMPLATE_PROMPT_APP_0504_1_1 = `10-sec TikTok UGC, 9:16, iPhone on tripod
0:00–0:03 | Medium shot, facing camera — white fluffy sherpa hat with green ears, platinum blonde hair with bangs, white tank top, nose and lip piercings, pouty expression. Stylish apartment with terracotta walls behind her. She's sitting at a desk with MacBook open. Looks at camera: "Wait, I need to show you where I've been getting my clothes."
0:03–0:07 | She turns the MacBook toward camera — screen shows @image1, static, no scrolling — LAYERED website, editorial flat-lay hero image, product grid, clean cream UI. She points at the screen with one finger. "This site is actually so good, look at this — everything is styled in layers, they have the cutest pieces." Her finger taps on a product card on screen.
0:07–0:10 | She turns laptop back, faces camera, slight nod with pouty satisfied look. "I already ordered three things, no regrets." End.
Static tripod, warm apartment lighting, natural tones. She talks casually at normal speed — not hyped, more like sharing a secret with a friend. No text overlays, no TikTok UI, raw footage.`;

const TEMPLATE_PROMPT_APP_0504_1_9 = `10-sec TikTok UGC, 9:16, iPhone on tripod
0:00–0:03 | Medium shot, facing camera — white fluffy sherpa hat with green ears, platinum blonde hair with bangs, white tank top, nose and lip piercings, pouty expression. Stylish apartment with terracotta walls behind her. She's sitting at a desk with MacBook open. Looks at camera: "Wait, I need to show you where I've been getting my clothes."
0:03–0:07 | She turns the MacBook toward camera — screen shows (LAYERED website, editorial flat-lay hero image, product grid, clean cream UI). She points at the screen with one finger. "This site is actually so good, look at this — everything is styled in layers, they have the cutest pieces." Her finger taps on a product card on screen.
0:07–0:10 | She turns laptop back, faces camera, slight nod with pouty satisfied look. "I already ordered three things, no regrets." End.
Static tripod, warm apartment lighting, natural tones. She talks casually at normal speed — not hyped, more like sharing a secret with a friend. No text overlays, no TikTok UI, raw footage.`;

const TEMPLATE_PROMPT_APP_0504_1_3 = `11-sec TikTok UGC, 9:16, iPhone
0:00–0:03 | Selfie close-up, front camera, young woman mid-twenties named Margot with long dark brown wavy hair parted in the middle falling past her shoulders, thin straight eyebrows, minimal makeup with a soft pink lip, large white drop earrings, wearing a buttoned pale yellow cropped cardigan over a lilac square-neck top, standing just inside the entrance of a modern minimalist coffee shop. Behind her out of focus: an illuminated glass-brick counter glowing warm from within, a linear pendant light, a barista in black moving behind a La Marzocco espresso machine. She shakes her hair back, raises her eyebrows into the lens with a knowing little smile. Playful "you need to know about this" energy.
0:03–0:08 | Camera flips to iPhone screen showing @image1, static, no scrolling. Her finger with short almond-shaped nude nails taps the "Oat milk" add-on, then "Raw honey," then slides to the 350 ml size, then taps the green "$4.20" button. "Okay I am OBSESSED — I used to stand in line here for like fifteen minutes every morning. Now I just open the app on my walk over, customize everything — oat milk, raw honey, size, done. Pay in-app and it's waiting for me by the time I get here."
0:08–0:11 | Camera flips back, handheld, now standing at the glowing glass-brick counter — Margot holds up a tall ribbed glass of matcha latte with thick foam and a dusting of bright green matcha powder on top, light catching the ombré green through the glass. She tilts it toward the camera, takes a small sip, closes her eyes for a second and does a tiny happy shoulder shimmy. The warm pendant light glows behind her, espresso machine hissing softly in the background. "No line. No waiting. Just this." She raises the glass like a toast. End.
One take, soft ambient-lit café setup — warm overhead track lighting, cool daylight spilling from the entrance, muted chatter and milk-steaming sounds in the background. No text overlays, no TikTok UI, raw footage. Chic playful it-girl tone that builds into pure drink-in-hand satisfaction.`;

const TEMPLATE_PROMPT_APP_0504_1_4 = `11-sec TikTok UGC, 9:16, iPhone
0:00–0:03 | Selfie close-up, front camera, young woman mid-twenties named Clara with dirty-blonde hair pulled back loosely, a few strands falling around her face, natural bare skin with light freckles, no makeup, wearing a black short-sleeve blouse with white polka dots and a crisp white peter-pan collar, standing in a softly lit bedroom corner. Behind her out of focus: two small wooden-framed colorful art prints on a cream wall, a sliver of white window frame catching afternoon light. She tilts her head slightly, gives a warm sheepish smile into the lens, brushing a strand of hair behind her ear. Gentle "okay hear me out" energy.
0:03–0:08 | Camera flips to iPhone screen showing @image1, static, no scrolling. Her finger with short unpainted nails taps the "Condition" card showing Moisture 68%, Light 45%, Temp 22°C, then gently taps the orange water droplet button. "Okay so — I am the worst plant mom on earth, I kill everything. But this app literally tells me when to water, how much light she needs, everything. Meet Monstera Marge — she's at 92% healthy and I have never been so proud."
0:08–0:11 | Camera flips back to face, now crouched next to a large Monstera deliciosa in a terracotta pot sitting on a small white wooden stool in the corner of her bedroom — the plant's big split leaves spilling out to both sides, rich soil visible, two small framed colorful art prints on the wall above, edge of a white bed visible in the foreground. Clara cups one of the large glossy leaves in her palm, cheek close to the plant, looking into the camera with a giddy proud grin. A small silver watering can rests on the stool beside the pot. "Go download Sprout. Marge says thank you." She gives the leaf a tiny kiss. End.
One take, cozy golden-hour bedroom setup — warm natural sunlight filtering through a sheer curtain, soft shadows on the cream wall, lived-in and intimate. No text overlays, no TikTok UI, raw footage. Soft affectionate plant-mom tone that builds into genuine pride and excitement.`;

const TEMPLATE_PROMPT_APP_0504_1_5 = `10-sec TikTok UGC, 9:16, iPhone
0:00–0:02 | Selfie close-up, front camera, young Asian woman mid-twenties with messy short black pixie haircut and choppy fringe, small silver hoop nose ring, no-makeup look, oversized cream cotton t-shirt, sitting on a deep blue velvet tufted sofa, vintage art posters softly out of focus behind her (yellow peaches "1999," black cat "NINE LIVES NONE LEFT"), warm afternoon sunlight from balcony window. She tilts her head, gives a soft excited smile straight into the lens. Gentle "omg you guys" energy.
0:02–0:07 | Camera flips to iPhone screen showing @image1, static, no scrolling. Her finger with short unpainted nails taps the "Activity monitoring" and "Nutrition" sections of the PawTrack app. "Okay so — I found this app that tracks literally everything about my dog. Activity, nutrition, GPS, sleep quality. And Buddy has never been healthier, look at his stats. This is actually life-changing for pet moms."
0:07–0:10 | Camera flips back to face, now sitting on the beige patterned rug hugging her young German Shepherd puppy from the side, cheek pressed against his fluffy head, both looking into the camera. Puppy has perky ears, bright eyes, glossy golden-brown coat, pink tongue out, small black GPS collar with paw icon. She grins widely, scratching behind his ear. "Go download it, I'm serious. My baby says hi." Dog licks her cheek. End.
One take, cozy afternoon setup — warm natural sunlight, sheer curtains glow, silver arc lamp and glass coffee table in frame. No text overlays, no TikTok UI, raw footage. Soft affectionate pet-mom tone that builds into genuine love and excitement.`;

const TEMPLATE_PROMPT_APP_0504_1_6 = `15-sec TikTok UGC, 9:16, iPhone
0:00–0:03 | Wide handheld shot, phone propped on a bench across the gym floor, young man mid-twenties named Adam, Black, clean low fade haircut, sharp jawline, sweat glistening across forehead and collarbones, wearing a fitted plain black ribbed tank top and black athletic shorts, mid-set on a flat bench pressing heavy dumbbells. Gym interior: dim low-lit space with black rubber flooring, rows of heavy dumbbells on a black rack, Technogym benches, mirrored wall reflecting warm pendant lighting, moody industrial vibe. He finishes his last rep with a loud grunt, slams both dumbbells down onto the rubber floor — loud THUD echoes — stands up fast, grabs the phone. Intense "listen up" energy.
0:03–0:06 | Selfie close-up, front camera, Adam breathing hard, veins visible in his neck, sweat dripping down his temple, staring dead into the lens. He points aggressively at the camera, jaw tight. "Yo — STOP paying a trainer two hundred bucks a session. I'm not playing with you right now."
0:06–0:11 | Camera flips to iPhone screen showing @image1, static, no scrolling. His thumb aggressively taps the neon-green "Today's Pick" AI banner, then taps into the "Strength" program card showing 42 min, 6/8 exercises, then the bar chart highlighting Set 7, then the Heart Rate 138 BPM tile. "This app builds your ENTIRE program. AI literally reads your recovery, your heart rate, your hydration — and gives you EXACTLY what to do today. 42 minutes. Eight exercises. Done. No guessing. No excuses."
0:11–0:15 | Camera flips back, Adam now standing in front of the dumbbell rack, grabs two heavier dumbbells, curls them up once hard, flexes into the camera, chest heaving, face intense but with a fired-up smirk breaking through. He kisses his bicep, then jabs his finger at the lens. "Download it. Right now. No more excuses. See you in the gym." He tosses the phone toward the bench — cut to black. End.
One take, dim industrial gym setup — moody overhead lighting, shadows on black rubber flooring, reflections in the mirror wall, live ambient sounds of weights clanking, heavy breathing, sneakers squeaking. No text overlays, no TikTok UI, raw handheld footage. Aggressive alpha gym-bro tone throughout — loud, intense, no-nonsense, borderline yelling but controlled.`;

const TEMPLATE_PROMPT_APP_0504_1_7 = `12-sec TikTok UGC, 9:16, iPhone
0:00–0:03 | Tripod, medium shot. Girl sitting at desk facing camera — green frog beanie, short blonde hair, zigzag knit tank top over white skirt. Cloth ventriloquist puppet on right hand raised to face level — puppet is her mini-me: same blonde hair, same green frog beanie, same zigzag top. She looks at puppet sideways. Puppet's mouth opens: "Hey, show them where you got me." She raises eyebrow. Her own voice pitched slightly higher for the puppet, lips barely moving.
0:03–0:09 | She holds up her phone in her left hand, screen facing camera — the phone shows @image1, static, no scrolling — a cute doll/puppet customization app with pink-purple UI, a "Build Your Mini-Me" screen visible with options for hair, outfit, accessories, and a preview of a custom puppet that looks like her. Right hand keeps the puppet raised next to the phone so both are in frame — the puppet and its digital version on screen side by side. Puppet's mouth moves: "You literally designed me on here. Pick the hair, pick the outfit, they make it and ship it. Look how accurate I am." She tilts the puppet toward the phone for comparison. Same ventriloquist voice, lips barely moving.
0:09–0:12 | She lowers the phone, faces camera with puppet still up. Puppet: "Go make your own." She drops the act, normal voice: "She's right, it's actually so fun." Slight smirk. End.
Tripod the whole time, bright indoor daylight, white wall, wooden desk. Puppet is a soft cloth hand puppet with hinged fabric mouth, blonde hair, matching outfit. Amateur ventriloquism — her voice, lips closed, slightly higher pitch for puppet. No text overlays, no TikTok UI, raw footage.`;

const TEMPLATE_PROMPT_APP_0504_1_8 = `12-sec TikTok UGC, 9:16, iPhone on tripod
0:00–0:03 | Medium shot, facing camera, blue beanie with ear ties, dark red hair, gold rimless glasses, cropped white graphic tee, denim shorts. Stylish apartment with checkerboard floor behind her. She holds her phone up next to her face, screen facing camera showing @image1 — COZYBOX app, purple/pink UI, cute 3D home goods. Static, no scrolling. "Okay so I found this app and I already spent too much money."
0:03–0:08 | She lowers the phone, steps to the side revealing a small pastel pink armchair and a mushroom-shaped lamp sitting on the floor/table behind her — actual items she ordered. She gestures at them with one hand, other hand still holding phone. "I got this chair and this lamp, look how cute they are in person." She picks up or touches the lamp briefly. Genuine happy energy, showing off her finds.
0:08–0:12 | She holds the phone back up to camera showing @image1 again, taps the screen. "It's called COZYBOX, everything on here is adorable. I'm going back in." She looks down at her phone and starts scrolling, half-smiling, already shopping again. End.
Static tripod, warm indoor apartment lighting, checkerboard floor visible in background. She talks at normal speed, casual and genuine — like telling a friend about a good find, not selling. No text overlays, no TikTok UI, no subtitles, raw footage.`;

const TEMPLATE_PROMPT_APP_0504_1_10 = `11-sec TikTok UGC, 9:16, iPhone
0:00–0:03 | Selfie close-up, front camera, young man mid-twenties named Erik with tousled shoulder-length dirty-blonde curly hair falling around his face, light stubble, hazel eyes, natural skin, wearing a plain neutral charcoal-grey football jersey (short sleeves, crew neck, lightweight breathable fabric, no logos or branding) paired with matching plain black athletic shorts, standing on the edge of a turf soccer field. Behind him out of focus: tall black netting, steel floodlight pole, hazy Manhattan skyline catching golden-hour light. He pushes a curl out of his eyes, gives a half-smirk into the lens. Laid-back "bro, listen" energy.
0:03–0:08 | Camera flips to iPhone screen showing @image1, static, no scrolling. His finger taps the "TONIGHT — 12+ matches near you" banner, then scrolls through the match list — "Midweek Mashup" at Hackney Marshes, 8/10 players — then taps into the match detail screen and selects the "MID" position button, finally hovering over the neon-green "JOIN MATCH" button. "Okay real talk — I just moved here and had literally nobody to kick a ball with. Found this app called Pitchup, it shows you every pickup match near you tonight. Pick your level, pick your position, tap join. That's it — I had a game locked in within a day."
0:08–0:11 | Camera flips back, handheld, now mid-field on the turf — Erik jogging backwards with a white soccer ball at his feet, wearing the same plain charcoal-grey unbranded football jersey and black shorts, now with a pair of plain black football cleats, grinning wide, a bit sweaty with jersey slightly clinging to him, the Manhattan skyline silhouetted behind him under a dusty pink and blue dusk sky, floodlights just coming on, other players small in the background. He flicks the ball up with his toe, catches it in his hand, points at the camera. "Seriously. Download it. I'll see you on the pitch." He drops the ball and turns to sprint after it. End.
One take, golden-to-dusk outdoor setup — warm waning sunlight, soft haze over the skyline, live ambient sounds of distant shouts and ball kicks. No text overlays, no TikTok UI, raw footage. Chill confident guy-who-just-found-his-people tone that builds into genuine hype and joy.`;

const TEMPLATE_PROMPT_UGC_TRY_ON_6 = `Style: UGC luxury, iPhone front camera, natural high-end lifestyle
Prompt:
A young stylish woman  is inside a modern luxury mansion (large windows, soft sunlight, neutral tones, minimal expensive interior).
Shot on iPhone front camera, vertical 9:16, Apple HDR, slightly overexposed highlights, realistic skin texture, natural lens distortion, no cinematic grading.
She is wearing a gold cuff bracelet .

Action:
She brings her wrist closer to camera:
"Okay… I didn’t expect to like this this much."
She rotates her wrist — light reflects naturally.

Dialogue:
"It’s super simple, but it looks really expensive."
She adjusts it.
"And it goes with literally everything."

She looks into camera:
"I’ve been wearing it every day."

Details (IMPORTANT):
natural iPhone highlight roll-off
slight exposure flicker when hand moves
realistic reflections on gold
subtle handheld micro shake
no perfect studio lighting`;

function normalizeTemplateLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Unboxing 2 (gym bike) — bundled stills; not generic Froggy unboxing. */
function isUnboxing2BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return (
    n.includes("unboxing (2)") ||
    n.includes("unboxing 2") ||
    n.includes("unboxing2") ||
    n.includes("unoboxing (2)") ||
    n.includes("unoboxing 2") ||
    n.includes("unoboxing2")
  );
}

/** Unboxing (3) jewelry flat-lay — bundled product still only (no avatar). */
function isUnboxing3BundledProductOnlyRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return (
    n.includes("unboxing (3)") ||
    n.includes("unboxing 3") ||
    n.includes("unboxing3") ||
    n.includes("unoboxing (3)") ||
    n.includes("unoboxing 3") ||
    n.includes("unoboxing3")
  );
}

/** Unboxing (4) influencer + luxury product — bundled product + avatar stills. */
function isUnboxing4BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return (
    n.includes("unboxing (4)") ||
    n.includes("unboxing 4") ||
    n.includes("unboxing4") ||
    n.includes("unoboxing (4)") ||
    n.includes("unoboxing 4") ||
    n.includes("unoboxing4")
  );
}

/**
 * App gallery `0504 (1)(1).mp4` — LAYERED web + avatar bundled Recreate.
 * Uses regex so `0504 (1)(10)` does not match as `(1)(1)`.
 */
function isAppTemplate050411BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return /\b0504\s*\(1\)\(1\)\)/u.test(n) || (n.includes("0504 (1)(1)") && !/\b0504\s*\(1\)\(10\)/u.test(n));
}

/** App gallery `0504 (1)(3).mp4` — Matcha app + Margot bundled Recreate. */
function isAppTemplate050413BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return /\b0504\s*\(1\)\(3\)/u.test(n) || n.includes("0504 (1)(3)");
}

/** App gallery `0504 (1)(9).mp4` — LAYERED variant (no @image token) bundled Recreate. */
function isAppTemplate050419BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return /\b0504\s*\(1\)\(9\)/u.test(n) || n.includes("0504 (1)(9)");
}

/** App gallery `0504 (1)(4).mp4` — Sprout + Clara bundled Recreate. */
function isAppTemplate050414BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return /\b0504\s*\(1\)\(4\)/u.test(n) || n.includes("0504 (1)(4)");
}

/** App gallery `0504 (1)(5).mp4` — PawTrack + pet-mom avatar bundled Recreate. */
function isAppTemplate050415BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return /\b0504\s*\(1\)\(5\)/u.test(n) || n.includes("0504 (1)(5)");
}

/** App gallery `0504 (1)(6).mp4` — Adam + fitness app UI bundled Recreate. */
function isAppTemplate050416BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return /\b0504\s*\(1\)\(6\)/u.test(n) || n.includes("0504 (1)(6)");
}

/** App gallery `0504 (1)(7).mp4` — Mini-Me app + ventriloquist bundled Recreate. */
function isAppTemplate050417BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return /\b0504\s*\(1\)\(7\)/u.test(n) || n.includes("0504 (1)(7)");
}

/** App gallery `0504 (1)(8).mp4` — COZYBOX app + avatar bundled Recreate. */
function isAppTemplate050418BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return /\b0504\s*\(1\)\(8\)/u.test(n) || n.includes("0504 (1)(8)");
}

/** App gallery `0504 (1)(10).mp4` — Pitchup + Erik bundled Recreate. */
function isAppTemplate0504110BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  return /\b0504\s*\(1\)\(10\)/u.test(n) || n.includes("0504 (1)(10)");
}

/** App gallery `0504 (1).mp4` (bare) — NOVARIDE + renter bundled Recreate; excludes `0504 (1)(N)`. */
function isAppTemplate0504Bare1BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  if (/\b0504\s*\(1\)\s*\(/u.test(n)) return false;
  return /\b0504\s*\(1\)/u.test(n);
}

/**
 * Froggy Prince ASMR packshots only — generic “Unboxing” cards.
 * Numbered Unboxing (2)–(4) use bundled stills instead.
 */
function isBundledFroggyUnboxingTemplateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  if (isUnboxing2BundledRecreateLabel(n)) return false;
  if (isUnboxing3BundledProductOnlyRecreateLabel(n)) return false;
  if (isUnboxing4BundledRecreateLabel(n)) return false;
  if (!n.includes("unboxing") && !n.includes("unoboxing")) return false;
  if (/\bunboxing\s*[234]\b/u.test(n) || /\bunboxing[234]\b/u.test(n)) return false;
  if (/\bunoboxing\s*[234]\b/u.test(n)) return false;
  return true;
}

/** Grab two JPEG frames from a template preview MP4 (same-origin) for Product + Avatar refs. */
async function captureTwoFramesFromTemplateVideo(videoUrl: string): Promise<[Blob, Blob]> {
  const absUrl = typeof window !== "undefined" ? new URL(videoUrl, window.location.origin).href : videoUrl;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = absUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load template preview."));
  });

  const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 4;
  const t1 = Math.min(0.12, Math.max(dur - 0.1, 0.05));
  let t2 = Math.min(Math.max(dur * 0.42, 0.22), dur - 0.08);
  if (Math.abs(t2 - t1) < 0.18) {
    t2 = Math.min(t1 + 0.55, dur - 0.08);
  }

  async function grabAt(t: number): Promise<Blob> {
    video.currentTime = Math.min(Math.max(t, 0.05), dur - 0.05);
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Seek failed."));
    });
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error("Missing video dimensions.");
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported.");
    ctx.drawImage(video, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Frame export failed."))), "image/jpeg", 0.9);
    });
  }

  try {
    const b1 = await grabAt(t1);
    const b2 = await grabAt(t2);
    return [b1, b2];
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

async function uploadTemplateRefsFromPreviewVideo(videoUrl: string): Promise<{ productUrl: string; avatarUrl: string }> {
  const [blob1, blob2] = await captureTwoFramesFromTemplateVideo(videoUrl);
  const [productUrl, avatarUrl] = await Promise.all([
    uploadFileToCdn(new File([blob1], "ads-template-product.jpg", { type: "image/jpeg" }), { kind: "image" }),
    uploadFileToCdn(new File([blob2], "ads-template-avatar.jpg", { type: "image/jpeg" }), { kind: "image" }),
  ]);
  return { productUrl, avatarUrl };
}

/**
 * Disk template titles like `UGC (Try On) (3).mp4` → label `UGC (Try On) (3)` → normalized
 * `ugc (try on) (3)` — does not contain the substring `try on 3`, so matchers must read this suffix.
 */
function ugcTryOnDiskVariantNumber(normalizedLabel: string): number | null {
  const m = normalizedLabel.match(/\((?:try\s*[-]?\s*on|tryon)\)\s*\((\d+)\)/);
  if (!m) return null;
  const num = Number.parseInt(m[1], 10);
  return Number.isFinite(num) && num >= 1 && num <= 99 ? num : null;
}

/** Matches promptForTemplateLabel “try on 2” templates (e.g. UGC Virtual Try On 2). */
function isVirtualTryOn2BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  if (ugcTryOnDiskVariantNumber(n) === 2) return true;
  return (
    n.includes("try on 2") ||
    n.includes("try-on 2") ||
    n.includes("tryon 2") ||
    n.includes("tryon2")
  );
}

/** UGC Try On 3 (bundled stills); excludes Tutorial. */
function isTryOn3BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  if (ugcTryOnDiskVariantNumber(n) === 3) return true;
  return (
    n.includes("try on 3") ||
    n.includes("try-on 3") ||
    n.includes("tryon 3") ||
    n.includes("tryon3")
  );
}

/** UGC Try On 4 (bundled stills); excludes Tutorial. */
function isTryOn4BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  if (ugcTryOnDiskVariantNumber(n) === 4) return true;
  return (
    n.includes("try on 4") ||
    n.includes("try-on 4") ||
    n.includes("tryon 4") ||
    n.includes("tryon4")
  );
}

/** UGC Try On 5 (bundled stills); excludes Tutorial. */
function isTryOn5BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  if (ugcTryOnDiskVariantNumber(n) === 5) return true;
  return (
    n.includes("try on 5") ||
    n.includes("try-on 5") ||
    n.includes("tryon 5") ||
    n.includes("tryon5")
  );
}

/** UGC Try On 6: Recreate sets prompt only — no Product/Avatar auto-upload (same as Hyper Motion). */
function isTryOn6NoRefsBundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  if (ugcTryOnDiskVariantNumber(n) === 6) return true;
  return (
    n.includes("try on 6") ||
    n.includes("try-on 6") ||
    n.includes("tryon 6") ||
    n.includes("tryon6") ||
    n.includes("tr on 6") ||
    n.includes("tron 6")
  );
}

function isHyperMotionTemplateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  return n.includes("hyper") && n.includes("motion");
}

/** “Tutorial” default template only — excludes Tutorial (2) / tutorial2. */
function isTutorialStandardTemplateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial 2") || n.includes("tutorial2") || n.includes("tutorial (2)")) return false;
  return n.includes("tutorial");
}

/** Pro Try On (bundled stills); excludes Virtual Try On and numbered try-ons. */
function isProTryOnTemplateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("virtual")) return false;
  if (/\btry\s*on\s*[23456789]\b/u.test(n) || /\btryon\s*[23456789]\b/u.test(n)) return false;
  return n.includes("pro") && (n.includes("try on") || n.includes("try-on") || n.includes("tryon"));
}

/** Generic “try on” (UGC Try On street prompt) — not Pro Try On, not Virtual Try On 2, not try-on 3–6. */
function isGenericUgcTryOnBundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (n.includes("tutorial")) return false;
  if (isProTryOnTemplateLabel(n)) return false;
  if (isVirtualTryOn2BundledRecreateLabel(n)) return false;
  if (isTryOn3BundledRecreateLabel(n)) return false;
  if (isTryOn4BundledRecreateLabel(n)) return false;
  if (isTryOn5BundledRecreateLabel(n)) return false;
  if (isTryOn6NoRefsBundledRecreateLabel(n)) return false;
  return n.includes("try on") || n.includes("try-on") || n.includes("tryon");
}

/** “UGC Woman” only — not numbered UGC or try-on templates. */
function isUgcWomanBundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (!n.includes("ugc")) return false;
  if (n.includes("try on") || n.includes("try-on") || n.includes("tryon")) return false;
  if (/\bugc\s*[23456789]\b/u.test(n) || /\bugc[23456789]\b/u.test(n)) return false;
  return /\bugc\s*woman\b/u.test(n);
}

/** UGC 2 only — not UGC 3/4/5/6 or UGC 12/20/22, etc.; not try-on templates that mention UGC + “(2)”. */
function isUgc2BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (!n.includes("ugc")) return false;
  if (n.includes("try on") || n.includes("try-on") || n.includes("tryon")) return false;
  if (/\bugc\s*[3456789]\b/u.test(n) || /\bugc[3456789]\b/u.test(n)) return false;
  if (/\bugc\s*1\d\b/u.test(n) || /\bugc\s*2\d\b/u.test(n) || /\bugc\s*3\d\b/u.test(n)) return false;
  if (/\bugc\s*2\b/u.test(n) || /\bugc2\b/u.test(n)) return true;
  return n.includes("(2)") && n.includes("ugc");
}

/** UGC 3 only — not UGC 30+, try-on templates, or other numbered UGC variants. */
function isUgc3BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (!n.includes("ugc")) return false;
  if (n.includes("try on") || n.includes("try-on") || n.includes("tryon")) return false;
  if (/\bugc\s*[2456789]\b/u.test(n) || /\bugc[2456789]\b/u.test(n)) return false;
  if (/\bugc\s*1\d\b/u.test(n) || /\bugc\s*2\d\b/u.test(n) || /\bugc\s*3\d\b/u.test(n)) return false;
  if (/\bugc\s*3\b/u.test(n) || /\bugc3\b/u.test(n)) return true;
  return n.includes("(3)") && n.includes("ugc");
}

/** UGC 4 only — not UGC 40+, try-on templates, or other numbered UGC variants. */
function isUgc4BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (!n.includes("ugc")) return false;
  if (n.includes("try on") || n.includes("try-on") || n.includes("tryon")) return false;
  if (/\bugc\s*[2356789]\b/u.test(n) || /\bugc[2356789]\b/u.test(n)) return false;
  if (/\bugc\s*1\d\b/u.test(n) || /\bugc\s*2\d\b/u.test(n) || /\bugc\s*3\d\b/u.test(n) || /\bugc\s*4\d\b/u.test(n)) {
    return false;
  }
  if (/\bugc\s*4\b/u.test(n) || /\bugc4\b/u.test(n)) return true;
  return n.includes("(4)") && n.includes("ugc");
}

/** UGC 5 only — not UGC 50+, try-on templates, or other numbered UGC variants. */
function isUgc5BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (!n.includes("ugc")) return false;
  if (n.includes("try on") || n.includes("try-on") || n.includes("tryon")) return false;
  if (/\bugc\s*[2346789]\b/u.test(n) || /\bugc[2346789]\b/u.test(n)) return false;
  if (
    /\bugc\s*1\d\b/u.test(n) ||
    /\bugc\s*2\d\b/u.test(n) ||
    /\bugc\s*3\d\b/u.test(n) ||
    /\bugc\s*4\d\b/u.test(n) ||
    /\bugc\s*5\d\b/u.test(n)
  ) {
    return false;
  }
  if (/\bugc\s*5\b/u.test(n) || /\bugc5\b/u.test(n)) return true;
  return n.includes("(5)") && n.includes("ugc");
}

/** UGC 6 only — not UGC 60+, try-on templates, or other numbered UGC variants. */
function isUgc6BundledRecreateLabel(normalizedLabel: string): boolean {
  const n = normalizedLabel;
  if (!n.includes("ugc")) return false;
  if (n.includes("try on") || n.includes("try-on") || n.includes("tryon")) return false;
  if (/\bugc\s*[2345789]\b/u.test(n) || /\bugc[2345789]\b/u.test(n)) return false;
  if (
    /\bugc\s*1\d\b/u.test(n) ||
    /\bugc\s*2\d\b/u.test(n) ||
    /\bugc\s*3\d\b/u.test(n) ||
    /\bugc\s*4\d\b/u.test(n) ||
    /\bugc\s*5\d\b/u.test(n) ||
    /\bugc\s*6\d\b/u.test(n)
  ) {
    return false;
  }
  if (/\bugc\s*6\b/u.test(n) || /\bugc6\b/u.test(n)) return true;
  return n.includes("(6)") && n.includes("ugc");
}

function promptForTemplateLabel(label: string): string {
  const n = normalizeTemplateLabel(label);
  if (n.includes("tutorial 2") || n.includes("tutorial2") || n.includes("tutorial (2)")) {
    return TEMPLATE_PROMPT_TUTORIAL_2;
  }
  if (n.includes("tutorial")) return TEMPLATE_PROMPT_TUTORIAL;
  if (isAppTemplate050411BundledRecreateLabel(n)) {
    return TEMPLATE_PROMPT_APP_0504_1_1;
  }
  if (isAppTemplate050419BundledRecreateLabel(n)) {
    return TEMPLATE_PROMPT_APP_0504_1_9;
  }
  if (isAppTemplate050413BundledRecreateLabel(n)) {
    return TEMPLATE_PROMPT_APP_0504_1_3;
  }
  if (/\b0504\s*\(1\)\(4\)/u.test(n) || n.includes("0504 (1)(4)")) {
    return TEMPLATE_PROMPT_APP_0504_1_4;
  }
  if (/\b0504\s*\(1\)\(5\)/u.test(n) || n.includes("0504 (1)(5)")) {
    return TEMPLATE_PROMPT_APP_0504_1_5;
  }
  if (/\b0504\s*\(1\)\(6\)/u.test(n) || n.includes("0504 (1)(6)")) {
    return TEMPLATE_PROMPT_APP_0504_1_6;
  }
  if (/\b0504\s*\(1\)\(7\)/u.test(n) || n.includes("0504 (1)(7)")) {
    return TEMPLATE_PROMPT_APP_0504_1_7;
  }
  if (/\b0504\s*\(1\)\(8\)/u.test(n) || n.includes("0504 (1)(8)")) {
    return TEMPLATE_PROMPT_APP_0504_1_8;
  }
  if (/\b0504\s*\(1\)\(10\)/u.test(n) || n.includes("0504 (1)(10)")) {
    return TEMPLATE_PROMPT_APP_0504_1_10;
  }
  if (isAppTemplate0504Bare1BundledRecreateLabel(n)) {
    return TEMPLATE_PROMPT_APP_0504_1;
  }
  if (
    n.includes("unboxing (4)") ||
    n.includes("unboxing 4") ||
    n.includes("unboxing4") ||
    n.includes("unoboxing (4)") ||
    n.includes("unoboxing 4") ||
    n.includes("unoboxing4")
  ) {
    return TEMPLATE_PROMPT_UNBOXING_4;
  }
  if (
    n.includes("unboxing (3)") ||
    n.includes("unboxing 3") ||
    n.includes("unboxing3") ||
    n.includes("unoboxing (3)") ||
    n.includes("unoboxing 3") ||
    n.includes("unoboxing3")
  ) {
    return TEMPLATE_PROMPT_UNBOXING_3;
  }
  if (
    n.includes("unboxing (2)") ||
    n.includes("unboxing 2") ||
    n.includes("unboxing2") ||
    n.includes("unoboxing (2)") ||
    n.includes("unoboxing 2") ||
    n.includes("unoboxing2")
  ) {
    return TEMPLATE_PROMPT_UNBOXING_2;
  }
  const tryOnDiskN = ugcTryOnDiskVariantNumber(n);
  if (
    tryOnDiskN === 6 ||
    n.includes("try on 6") ||
    n.includes("try-on 6") ||
    n.includes("tryon 6") ||
    n.includes("tryon6") ||
    n.includes("tr on 6") ||
    n.includes("tron 6")
  ) {
    return TEMPLATE_PROMPT_UGC_TRY_ON_6;
  }
  if (
    tryOnDiskN === 3 ||
    n.includes("try on 3") ||
    n.includes("try-on 3") ||
    n.includes("tryon 3") ||
    n.includes("tryon3")
  ) {
    return TEMPLATE_PROMPT_UGC_TRY_ON_3;
  }
  if (
    tryOnDiskN === 4 ||
    n.includes("try on 4") ||
    n.includes("try-on 4") ||
    n.includes("tryon 4") ||
    n.includes("tryon4")
  ) {
    return TEMPLATE_PROMPT_UGC_TRY_ON_4;
  }
  if (
    tryOnDiskN === 5 ||
    n.includes("try on 5") ||
    n.includes("try-on 5") ||
    n.includes("tryon 5") ||
    n.includes("tryon5")
  ) {
    return TEMPLATE_PROMPT_UGC_TRY_ON_5;
  }
  if (
    tryOnDiskN === 2 ||
    n.includes("try on 2") ||
    n.includes("try-on 2") ||
    n.includes("tryon 2") ||
    n.includes("tryon2")
  ) {
    return TEMPLATE_PROMPT_UGC_TRY_ON_2;
  }
  if (n.includes("ugc 6") || n.includes("ugc6")) return TEMPLATE_PROMPT_UGC_6;
  if (n.includes("ugc 5") || n.includes("ugc5")) return TEMPLATE_PROMPT_UGC_5;
  if (n.includes("try on")) return TEMPLATE_PROMPT_UGC_TRY_ON_STREET;
  if ((n.includes("ugc") && (n.includes(" 4") || n.endsWith("4") || n.includes("(4)"))) || n.includes("ugc4")) {
    return TEMPLATE_PROMPT_UGC_4;
  }
  if ((n.includes("ugc") && (n.includes(" 3") || n.endsWith("3") || n.includes("(3)"))) || n.includes("ugc3")) {
    return TEMPLATE_PROMPT_UGC_3;
  }
  if (n.includes("hyper") && n.includes("motion")) return TEMPLATE_PROMPT_HYPER_MOTION;
  if (n.includes("unoboxing") || n.includes("unboxing")) return TEMPLATE_PROMPT_UNBOXING;
  if (
    (n.includes("ugc") && (n.includes("(2)") || n.includes(" 2") || n.endsWith("2"))) ||
    n.includes("ugc 2")
  ) {
    return TEMPLATE_PROMPT_UGC_2;
  }
  if (n.includes("ugc")) return TEMPLATE_PROMPT_UGC;
  return `${label} style, short high-converting vertical ad.`;
}

async function pollVideo(taskId: string, personalApiKey?: string, piapiApiKey?: string): Promise<string> {
  const deadline = Date.now() + ADS_STUDIO_VIDEO_POLL_MAX_MS;
  const keyParam = `${personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : ""}${piapiApiKey ? `&piapiApiKey=${encodeURIComponent(piapiApiKey)}` : ""}`;
  const wait = () => new Promise((r) => setTimeout(r, ADS_STUDIO_VIDEO_POLL_INTERVAL_MS));

  while (Date.now() < deadline) {
    const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}${keyParam}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { status?: string; response?: string[]; error_message?: string | null };
      error?: string;
    };
    if (!res.ok) {
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        await wait();
        continue;
      }
      throw new Error(json.error || `Video poll failed (HTTP ${res.status}).`);
    }
    if (!json.data) throw new Error(json.error || "Video poll failed");
    const st = String(json.data.status ?? "IN_PROGRESS").toUpperCase();
    const inFlight = new Set([
      "",
      "IN_PROGRESS",
      "PENDING",
      "PROCESSING",
      "QUEUED",
      "WAITING",
      "RUNNING",
      "COMPLETED",
      "COMPLETE",
      "SUCCEEDED",
      "DONE",
    ]);
    if (inFlight.has(st)) {
      await wait();
      continue;
    }
    if (st === "SUCCESS") {
      const u = json.data.response?.[0];
      if (!u || typeof u !== "string") {
        await wait();
        continue;
      }
      return u;
    }
    if (st === "FAILED") {
      throw new Error(json.data.error_message?.trim() || "Video generation failed.");
    }
    await wait();
  }
  const hours = ADS_STUDIO_VIDEO_POLL_MAX_MS / (60 * 60 * 1000);
  throw new Error(
    `Video is still processing on the server, but this tab stopped waiting after ${hours} hour(s). Refresh the page or check back later.`,
  );
}

function adsStudioProductSlotUrl(h: AdsStudioHistoryItem): string | undefined {
  const p = h.productRefUrl?.trim();
  if (p) return p;
  const a = h.avatarRefUrl?.trim();
  if (!a && h.imageUrl?.trim()) return h.imageUrl.trim();
  return undefined;
}

function adsStudioAvatarSlotUrl(h: AdsStudioHistoryItem): string | undefined {
  return h.avatarRefUrl?.trim() || undefined;
}

function adsStudioProductSlotUrlFromJob(j: AdsStudioActiveJob): string | undefined {
  const p = j.productRefUrl?.trim();
  if (p) return p;
  const a = j.avatarRefUrl?.trim();
  if (!a) {
    const t = (j.previewStillUrl ?? j.thumbUrl ?? "").trim();
    return t || undefined;
  }
  return undefined;
}

function adsStudioAvatarSlotUrlFromJob(j: AdsStudioActiveJob): string | undefined {
  return j.avatarRefUrl?.trim() || undefined;
}

function AdsStudioProjectDetailBody(
  props:
    | { kind: "history"; item: AdsStudioHistoryItem; onLoadIntoComposer: () => void }
    | { kind: "job"; job: AdsStudioActiveJob; onLoadIntoComposer: () => void },
) {
  const onLoad = props.onLoadIntoComposer;
  const [videoBroken, setVideoBroken] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  const mediaResetKey =
    props.kind === "history"
      ? `${props.item.id}:${props.item.videoUrl ?? ""}`
      : `${props.job.id}:${props.job.phase}:${props.job.thumbUrl ?? ""}:${props.job.previewStillUrl ?? ""}`;

  useEffect(() => {
    setVideoBroken(false);
  }, [mediaResetKey]);

  if (props.kind === "history") {
    const h = props.item;
    const productUrl = adsStudioProductSlotUrl(h);
    const avatarUrlResolved = adsStudioAvatarSlotUrl(h);
    const assetLabel = h.assetType === "app" ? "App" : "Product";
    const playback = resolveAdsStudioPlaybackUrl(h.videoUrl);
    const productSrc = resolveAdsStudioPlaybackUrl(productUrl) ?? productUrl;
    const avatarSrc = resolveAdsStudioPlaybackUrl(avatarUrlResolved) ?? avatarUrlResolved;

    const copyPrompt = async () => {
      const text = (h.prompt ?? "").trim();
      if (!text) return;
      if (copyBusy) return;
      setCopyBusy(true);
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Prompt copied");
      } catch {
        toast.error("Could not copy the prompt");
      } finally {
        setCopyBusy(false);
      }
    };

    const videoBlock =
      playback && !videoBroken ? (
        <video
          key={playback}
          src={playback}
          controls
          playsInline
          preload="metadata"
          className="max-h-[min(40vh,300px)] w-full bg-black object-contain"
          onError={() => setVideoBroken(true)}
        />
      ) : playback && videoBroken ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-white/70">Could not load the video preview in this dialog.</p>
          <a
            href={playback}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center justify-center rounded-md border border-white/20 bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-white/15"
          >
            Open video in new tab
          </a>
        </div>
      ) : (
        <div className="flex min-h-[200px] items-center justify-center px-4 text-center text-sm text-white/50">
          No stored playback URL for this clip. Older saves may be missing the link — generate again to keep playback.
        </div>
      );

    return (
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="shrink-0 border-b border-white/10 bg-[#0f0f13] p-4 sm:w-[58%] sm:border-b-0 sm:border-r">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Video output</p>
              <p className="mt-1 text-xs text-white/35">Saved clip</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {playback ? (
                <a
                  href={playback}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/85 transition hover:bg-white/10"
                >
                  Open
                </a>
              ) : null}
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/55">{videoBlock}</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Prompt</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={copyBusy || !(h.prompt ?? "").trim()}
              onClick={() => void copyPrompt()}
              className="h-8 border-white/15 bg-transparent px-2.5 text-xs text-white/80 hover:bg-white/10"
            >
              Copy
            </Button>
          </div>
          <Textarea
            readOnly
            value={h.prompt || "—"}
            rows={8}
            className="mt-2 max-h-[min(48vh,460px)] min-h-[9rem] resize-y overflow-y-auto border-white/[0.08] bg-black/30 text-[13px] leading-relaxed text-white/85"
          />

          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">Uploads</p>
            <div className="flex flex-wrap gap-3">
              <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/85">
                  {assetLabel} (@image1)
                </span>
                <a
                  href={productSrc || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "aspect-square w-full max-w-[180px] overflow-hidden rounded-lg border border-white/10 bg-black/40",
                    productSrc ? "cursor-pointer hover:border-white/20" : "pointer-events-none",
                  )}
                >
                  {productSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={productSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full min-h-[120px] items-center justify-center text-[10px] text-white/35">
                      None
                    </div>
                  )}
                </a>
              </div>
              <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/85">
                  Avatar (@image2)
                </span>
                <a
                  href={avatarSrc || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "aspect-square w-full max-w-[180px] overflow-hidden rounded-lg border border-white/10 bg-black/40",
                    avatarSrc ? "cursor-pointer hover:border-white/20" : "pointer-events-none",
                  )}
                >
                  {avatarSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full min-h-[120px] items-center justify-center text-[10px] text-white/35">
                      None
                    </div>
                  )}
                </a>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" className="border-white/15 bg-transparent text-white/85 hover:bg-white/10">
                Close
              </Button>
            </Dialog.Close>
            <Button type="button" onClick={onLoad} className="bg-violet-600 text-white hover:bg-violet-500">
              Load into composer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const j = props.job;
  const productUrl = adsStudioProductSlotUrlFromJob(j);
  const avatarUrlResolved = adsStudioAvatarSlotUrlFromJob(j);
  const assetLabel = j.jobAssetType === "app" ? "App" : "Product";
  const promptText = (j.promptFull ?? j.promptSnippet).trim() || "—";
  const productSrc = resolveAdsStudioPlaybackUrl(productUrl) ?? productUrl;
  const avatarSrc = resolveAdsStudioPlaybackUrl(avatarUrlResolved) ?? avatarUrlResolved;
  const thumbRaw = (j.previewStillUrl ?? j.thumbUrl ?? "").trim();
  const thumbSrc = thumbRaw ? resolveAdsStudioPlaybackUrl(thumbRaw) ?? thumbRaw : null;

  const copyPrompt = async () => {
    if (!promptText.trim()) return;
    if (copyBusy) return;
    setCopyBusy(true);
    try {
      await navigator.clipboard.writeText(promptText);
      toast.success("Prompt copied");
    } catch {
      toast.error("Could not copy the prompt");
    } finally {
      setCopyBusy(false);
    }
  };

  const statusBlock =
    j.phase === "failed" ? (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-300/90">Failed</p>
        <p className="max-w-prose text-sm leading-snug text-rose-100/90">{j.error?.trim() || "Generation failed."}</p>
      </div>
    ) : thumbSrc ? (
      <div className="relative mx-auto max-h-[min(40vh,300px)] w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbSrc} alt="" className="h-full w-full object-contain" />
        {j.phase === "submitting" || j.phase === "rendering" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
            <Loader2 className="size-10 animate-spin text-white" aria-hidden />
            <p className="text-xs font-medium text-white/90">
              {j.phase === "submitting" ? "Submitting…" : "Rendering…"}
            </p>
          </div>
        ) : null}
      </div>
    ) : (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-white/45">No preview yet.</div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      <div className="shrink-0 border-b border-white/10 bg-[#0f0f13] p-4 sm:w-[58%] sm:border-b-0 sm:border-r">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Preview</p>
            <p className="mt-1 text-xs text-white/35">
              {j.phase === "failed" ? "Failed" : j.phase === "rendering" ? "Rendering" : "Submitting"}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {thumbSrc ? (
              <a
                href={thumbSrc}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-md border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/85 transition hover:bg-white/10"
              >
                Open
              </a>
            ) : null}
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/55">{statusBlock}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Prompt</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={copyBusy || !promptText.trim()}
            onClick={() => void copyPrompt()}
            className="h-8 border-white/15 bg-transparent px-2.5 text-xs text-white/80 hover:bg-white/10"
          >
            Copy
          </Button>
        </div>
        <Textarea
          readOnly
          value={promptText}
          rows={8}
          className="mt-2 max-h-[min(48vh,460px)] min-h-[9rem] resize-y overflow-y-auto border-white/[0.08] bg-black/30 text-[13px] leading-relaxed text-white/85"
        />

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">Uploads</p>
          <div className="flex flex-wrap gap-3">
            <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/85">
                {assetLabel} (@image1)
              </span>
              <a
                href={productSrc || "#"}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "aspect-square w-full max-w-[180px] overflow-hidden rounded-lg border border-white/10 bg-black/40",
                  productSrc ? "cursor-pointer hover:border-white/20" : "pointer-events-none",
                )}
              >
                {productSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={productSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-[120px] items-center justify-center text-[10px] text-white/35">None</div>
                )}
              </a>
            </div>
            <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/85">Avatar (@image2)</span>
              <a
                href={avatarSrc || "#"}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "aspect-square w-full max-w-[180px] overflow-hidden rounded-lg border border-white/10 bg-black/40",
                  avatarSrc ? "cursor-pointer hover:border-white/20" : "pointer-events-none",
                )}
              >
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-[120px] items-center justify-center text-[10px] text-white/35">None</div>
                )}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
          <Dialog.Close asChild>
            <Button type="button" variant="outline" className="border-white/15 bg-transparent text-white/85 hover:bg-white/10">
              Close
            </Button>
          </Dialog.Close>
          <Button type="button" onClick={onLoad} className="bg-violet-600 text-white hover:bg-violet-500">
            Load into composer
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdsStudioPanel() {
  const { planId } = useCreditsPlan();
  const [assetType, setAssetType] = useState<"product" | "app">("product");
  const [videoDurationSec, setVideoDurationSec] = useState(15);
  const [outputAspect, setOutputAspect] = useState<AdsStudioOutputAspect>("9:16");
  const [videoResolution, setVideoResolution] = useState<AdsStudioVideoResolution>("720p");
  const [prompt, setPrompt] = useState("");
  const [appRefUrl, setAppRefUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [activeJobs, setActiveJobs] = useState<AdsStudioActiveJob[]>([]);
  const [selectedSidebarKey, setSelectedSidebarKey] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<AdsStudioProjectDetail | null>(null);
  const [history, setHistory] = useState<AdsStudioHistoryItem[]>([]);
  const [templateVideosByKind, setTemplateVideosByKind] = useState<Record<AdsStudioTemplateGalleryKind, TemplateVideoItem[]>>({
    product: [],
    app: [],
  });
  const [adsTemplateGalleryKind, setAdsTemplateGalleryKind] = useState<AdsStudioTemplateGalleryKind>("product");
  const [uploadingRefSlot, setUploadingRefSlot] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [refSourceDialogOpen, setRefSourceDialogOpen] = useState(false);
  const [refSourceDialogMode, setRefSourceDialogMode] = useState<"product" | "avatar">("product");
  const [avatarLibraryUrls, setAvatarLibraryUrls] = useState<string[]>([]);
  const [avatarLibLoading, setAvatarLibLoading] = useState(false);
  const composerPanelRef = useRef<HTMLDivElement>(null);
  const appInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  /** Same-tab: polling already running for this job id (prevents duplicate pollers after taskId is written). */
  const adsStudioPollingStartedRef = useRef(new Set<string>());
  /** User removed a job from the list — ignore late poll/generation completion for that id. */
  const adsStudioDismissedJobIdsRef = useRef(new Set<string>());
  const [activeJobsStorageReady, setActiveJobsStorageReady] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(LS_ADS_STUDIO_COMPOSER_DRAFT_V1);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.prompt === "string") setPrompt(parsed.prompt);
      if (typeof parsed.appRefUrl === "string") {
        const t = parsed.appRefUrl.trim();
        if (t === "" || isHttpsOrHttpUrl(t)) setAppRefUrl(t);
      }
      if (typeof parsed.avatarUrl === "string") {
        const t = parsed.avatarUrl.trim();
        if (t === "" || isHttpsOrHttpUrl(t)) setAvatarUrl(t);
      }
      setAssetType(parsed.assetType === "app" ? "app" : "product");
      setVideoDurationSec(safeAdsStudioComposerDuration(parsed.videoDurationSec));
      setOutputAspect(safeAdsStudioOutputAspect(parsed.outputAspect));
      setVideoResolution(safeAdsStudioVideoResolution(parsed.videoResolution));
      setAdsTemplateGalleryKind(parsed.adsTemplateGalleryKind === "app" ? "app" : "product");
    } catch {
      /* ignore malformed draft */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = {
      v: 1 as const,
      prompt,
      appRefUrl,
      avatarUrl,
      assetType,
      videoDurationSec,
      outputAspect,
      videoResolution,
      adsTemplateGalleryKind,
    };
    try {
      localStorage.setItem(LS_ADS_STUDIO_COMPOSER_DRAFT_V1, JSON.stringify(draft));
    } catch {
      /* ignore quota / private mode */
    }
  }, [
    prompt,
    appRefUrl,
    avatarUrl,
    assetType,
    videoDurationSec,
    outputAspect,
    videoResolution,
    adsTemplateGalleryKind,
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_ADS_STUDIO_HISTORY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      setHistory(sanitizeAdsStudioHistoryRows(parsed));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ADS_STUDIO_HISTORY, JSON.stringify(history.slice(0, 24)));
    } catch {
      /* ignore */
    }
  }, [history]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_ADS_STUDIO_ACTIVE_JOBS);
      if (!raw) {
        setActiveJobsStorageReady(true);
        return;
      }
      const parsed = JSON.parse(raw) as AdsStudioActiveJob[];
      if (!Array.isArray(parsed)) {
        setActiveJobsStorageReady(true);
        return;
      }
      const now = Date.now();
      const cleaned = parsed
        .filter((j) => j && typeof j.id === "string")
        .filter((j) => now - j.createdAt < ADS_STUDIO_MAX_ACTIVE_JOB_AGE_MS)
        /** Cannot resume without a server task id (request may still finish remotely, but we cannot poll). */
        .filter((j) => !(j.phase === "submitting" && !j.taskId))
        .slice(0, 32);
      setActiveJobs(cleaned);
    } catch {
      /* ignore */
    }
    setActiveJobsStorageReady(true);
  }, []);

  useEffect(() => {
    if (!activeJobsStorageReady) return;
    try {
      localStorage.setItem(LS_ADS_STUDIO_ACTIVE_JOBS, JSON.stringify(activeJobs.slice(0, 32)));
    } catch {
      /* ignore */
    }
  }, [activeJobs, activeJobsStorageReady]);

  useEffect(() => {
    let cancelled = false;
    const loadKind = async (kind: AdsStudioTemplateGalleryKind) => {
      const res = await fetch(`/api/studio/template-videos?kind=${encodeURIComponent(kind)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { videos?: TemplateVideoItem[] } | null;
      if (cancelled) return;
      const videos = Array.isArray(json?.videos) ? json.videos : [];
      setTemplateVideosByKind((prev) => ({ ...prev, [kind]: videos }));
    };
    // Preload both lists so switching tabs is instantaneous.
    void loadKind("product");
    void loadKind("app");
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAvatarLibLoading(true);
    void loadAvatarUrls()
      .then((urls) => {
        if (!cancelled) setAvatarLibraryUrls(urls);
      })
      .finally(() => {
        if (!cancelled) setAvatarLibLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mentionEntries = useMemo((): AdsStudioMentionEntry[] => {
    const hasP = Boolean(appRefUrl.trim());
    const avTrim = avatarUrl.trim();
    const hasA = Boolean(avTrim);
    /** Matches Seedance ordering: @image1 = product/app start frame, @image2 = avatar when both uploads exist. */
    let nextLibrarySlot = 1;
    if (hasP) nextLibrarySlot += 1;
    if (hasA) nextLibrarySlot += 1;
    const out: AdsStudioMentionEntry[] = [];

    if (hasP) {
      out.push({
        id: "attached-product",
        section: "attached",
        label: assetType === "app" ? "App reference" : "Product reference",
        thumbnailUrl: appRefUrl.trim(),
        token: "@image1",
      });
    }
    if (hasA) {
      out.push({
        id: "attached-avatar-upload",
        section: "attached",
        label: "Avatar (uploaded)",
        thumbnailUrl: avTrim,
        token: hasP ? "@image2" : "@image1",
      });
    }

    avatarLibraryUrls.forEach((url, i) => {
      const u = url.trim();
      if (!u) return;
      if (avTrim && u === avTrim) return;
      out.push({
        id: `avatar-lib-${i}-${u.slice(-16)}`,
        section: "avatar",
        label: `Library avatar ${i + 1}`,
        thumbnailUrl: u,
        token: `@image${nextLibrarySlot + i}`,
      });
    });

    return out;
  }, [appRefUrl, avatarUrl, assetType, avatarLibraryUrls]);

  const adsMentionTabs = useMemo((): MentionElementTabConfig => {
    return {
      tabs: [
        { id: "attached", label: "Attached" },
        { id: "library", label: "Avatar library" },
      ],
      getTabId: (el: MentionElementOption) =>
        el.id.startsWith("avatar-lib") ? "library" : "attached",
    };
  }, []);

  const mentionElementOptions = useMemo((): MentionElementOption[] => {
    return mentionEntries.map((e) => {
      const chipLabel =
        e.id === "attached-product"
          ? assetType === "app"
            ? "App"
            : "Product"
          : e.id === "attached-avatar-upload"
            ? "Avatar"
            : e.label;
      return {
        id: e.id,
        name: e.token.replace(/^@/, ""),
        previewUrl: e.thumbnailUrl,
        previewKind: "image",
        chipLabel,
        description: e.token,
      };
    });
  }, [mentionEntries, assetType]);

  const handlePickMentionElement = useCallback(
    (el: MentionElementOption) => {
      const entry = mentionEntries.find((row) => row.id === el.id);
      if (entry?.section === "avatar") {
        setAvatarUrl(entry.thumbnailUrl);
      }
    },
    [mentionEntries],
  );

  const runningJobCount = useMemo(
    () => activeJobs.filter((j) => j.phase === "submitting" || j.phase === "rendering").length,
    [activeJobs],
  );
  const hasSubmittingJob = useMemo(
    () => activeJobs.some((j) => j.phase === "submitting"),
    [activeJobs],
  );

  const selectedFailedJobMessage = useMemo(() => {
    if (!selectedSidebarKey?.startsWith("job:")) return null;
    const id = selectedSidebarKey.slice(4);
    const j = activeJobs.find((x) => x.id === id);
    if (!j || j.phase !== "failed" || !j.error?.trim()) return null;
    return j.error.trim();
  }, [selectedSidebarKey, activeJobs]);

  const generationCredits = useMemo(
    () =>
      calculateVideoCreditsForModel({
        modelId: ADS_STUDIO_SEEDANCE_MODEL,
        duration: videoDurationSec,
        audio: true,
        videoResolution,
      }),
    [videoDurationSec, videoResolution],
  );
  const presetPreviewVideos = useMemo(
    () => history.map((h) => h.videoUrl).filter((u): u is string => typeof u === "string" && u.length > 0),
    [history],
  );
  const templateVideos = templateVideosByKind[adsTemplateGalleryKind] ?? [];

  async function uploadRef(file: File, kind: "app" | "avatar") {
    if (kind === "app") setUploadingRefSlot(true);
    else setUploadingAvatar(true);
    try {
      let toUpload = file;
      try {
        toUpload = await compressImageFileForUpload(file);
      } catch {
        toUpload = file;
      }
      const url = await uploadFileToCdn(toUpload, { kind: "image" });
      if (kind === "app") setAppRefUrl(url);
      else setAvatarUrl(url);
      toast.success(
        kind === "app"
          ? assetType === "app"
            ? "App reference uploaded"
            : "Product reference uploaded"
          : "Avatar uploaded",
      );
    } catch (err) {
      logGenerationFailure("ads-studio.ref-upload", err, { kind });
      toast.error("Upload failed", { description: userMessageFromCaughtError(err, "Upload failed.") });
    } finally {
      if (kind === "app") setUploadingRefSlot(false);
      else setUploadingAvatar(false);
    }
  }

  function runGenerate(promptOverride?: string, refOverride?: AdsStudioRunGenerateRefOverride) {
    const snapAssetType = refOverride?.assetType ?? assetType;
    const snapAppRef = (refOverride?.appRefUrl ?? appRefUrl).trim();
    const snapAvatar = (refOverride?.avatarUrl ?? avatarUrl).trim();

    const trimmed = (promptOverride ?? prompt).trim();
    const hasUploadedRefs = Boolean(snapAppRef || snapAvatar);
    if (!trimmed && !hasUploadedRefs) {
      toast.error("Ads Studio", {
        description: "Add a prompt in the text box or upload at least one reference image.",
      });
      return;
    }
    const p =
      trimmed ||
      (hasUploadedRefs
        ? "Create a high-converting vertical ad that follows the reference images for subject, branding, and composition."
        : "");
    if (!p) return;
    const snapAspect = outputAspect;
    const snapDur = videoDurationSec;
    const snapRes = videoResolution;
    const snapPlan = planId;

    const jobId = crypto.randomUUID();
    const promptSnippet = p.length > 100 ? `${p.slice(0, 97)}…` : p;
    const thumbUrl = snapAppRef || snapAvatar || undefined;

    setActiveJobs((prev) => {
      const next: AdsStudioActiveJob[] = [
        {
          id: jobId,
          createdAt: Date.now(),
          phase: "submitting",
          promptSnippet,
          thumbUrl,
          promptFull: p,
          jobAssetType: snapAssetType,
          previewStillUrl: snapAppRef || snapAvatar || undefined,
          productRefUrl: snapAppRef || undefined,
          avatarRefUrl: snapAvatar || undefined,
        },
        ...prev,
      ];
      return next.slice(0, 32);
    });
    setSelectedSidebarKey(`job:${jobId}`);

    void (async () => {
      const personalApiKey = getPersonalApiKey();
      const piapiApiKey = getPersonalPiapiApiKey();
      try {
        const basePrompt =
          snapAssetType === "app"
            ? `${p}\n\nCreate an APP-focused ad visual (UI usage, mobile screen context, feature/value outcomes).`
            : `${p}\n\nCreate a PRODUCT-focused ad visual (packaging, product handling, realistic creator environment).`;
        let enrichedPrompt = basePrompt;
        if (snapAvatar) {
          enrichedPrompt +=
            "\n\nIf a human subject appears, match their face and overall appearance to the avatar reference image.";
        }

        const productUrl = snapAppRef;
        const avUrl = snapAvatar;

        let videoPrompt = `${enrichedPrompt}\n\nMake this a high-converting short ad clip.`;
        if (productUrl && avUrl) {
          videoPrompt += `\n\nSeedance references: @image1 = ${snapAssetType === "app" ? "app / UI" : "product"} reference (start frame); @image2 = avatar reference. You may mention @image1 and @image2 in the scene description.`;
        } else if (productUrl) {
          videoPrompt += `\n\nSeedance reference: @image1 = ${snapAssetType === "app" ? "app / UI" : "product"} reference (start frame).`;
        } else if (avUrl) {
          videoPrompt += `\n\nSeedance reference: @image1 = avatar reference (start frame).`;
        }

        if (videoPrompt.length > SEEDANCE_PRO_PROMPT_MAX_CHARS) {
          const prevLen = videoPrompt.length;
          videoPrompt = videoPrompt.slice(0, SEEDANCE_PRO_PROMPT_MAX_CHARS).trim();
          toast.message("Prompt trimmed for Seedance", {
            description: `This model accepts up to ${SEEDANCE_PRO_PROMPT_MAX_CHARS.toLocaleString("en-US")} characters (${prevLen.toLocaleString("en-US")} before trim). The end of the text was removed so the request can succeed.`,
          });
        }

        const videoPayload: Record<string, unknown> = {
          accountPlan: snapPlan,
          marketModel: ADS_STUDIO_SEEDANCE_MODEL,
          /** Kie Market Seedance 2.0 (`createTask`), not PiAPI. @see https://docs.kie.ai/market/bytedance/seedance-2 */
          seedanceBackend: "kie",
          prompt: videoPrompt,
          duration: snapDur,
          aspectRatio: snapAspect,
          sound: true,
          videoResolution: snapRes,
          personalApiKey: personalApiKey ?? undefined,
          piapiApiKey: piapiApiKey ?? undefined,
        };
        // Two references: use omni image list only (same as Studio → Video). Avoid imageUrl + klingElements,
        // which forced element/omni paths and extra provider-side reference handling per ref.
        if (productUrl && avUrl) {
          videoPayload.seedanceOmniMedia = [
            { type: "image", url: productUrl },
            { type: "image", url: avUrl },
          ];
        } else if (productUrl) {
          videoPayload.imageUrl = productUrl;
        } else if (avUrl) {
          videoPayload.imageUrl = avUrl;
        }

        const videoRes = await fetch("/api/kling/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(videoPayload),
        });
        const videoJson = (await videoRes.json()) as { taskId?: string; error?: string };
        if (!videoRes.ok || !videoJson.taskId) throw new Error(videoJson.error || "Video generation failed");

        if (adsStudioDismissedJobIdsRef.current.has(jobId)) {
          adsStudioDismissedJobIdsRef.current.delete(jobId);
          return;
        }

        adsStudioPollingStartedRef.current.add(jobId);

        setActiveJobs((prev) =>
          prev.map((j) =>
            j.id === jobId ? { ...j, phase: "rendering" as const, taskId: videoJson.taskId } : j,
          ),
        );

        const vUrl = await pollVideo(videoJson.taskId, personalApiKey ?? undefined, piapiApiKey ?? undefined);
        if (adsStudioDismissedJobIdsRef.current.has(jobId)) {
          adsStudioDismissedJobIdsRef.current.delete(jobId);
          return;
        }
        const previewStillUrl = productUrl || avUrl || undefined;
        const historyId = crypto.randomUUID();
        const item: AdsStudioHistoryItem = {
          id: historyId,
          createdAt: Date.now(),
          assetType: snapAssetType,
          prompt: p,
          imageUrl: previewStillUrl,
          videoUrl: vUrl,
          productRefUrl: productUrl || undefined,
          avatarRefUrl: avUrl || undefined,
        };
        setHistory((prev) => [item, ...prev].slice(0, 24));

        setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));

        setSelectedSidebarKey(`history:${historyId}`);

        toast.success("Ads Studio generation complete");
      } catch (err) {
        if (adsStudioDismissedJobIdsRef.current.has(jobId)) {
          adsStudioDismissedJobIdsRef.current.delete(jobId);
          return;
        }
        logGenerationFailure("ads-studio.generate", err, { jobId });
        const msg = userMessageFromCaughtError(err);
        setActiveJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, phase: "failed" as const, error: msg } : j)),
        );
        toast.error("Ads Studio", { description: msg });
      }
    })();
  }

  /** After reload: resume polling for persisted jobs (remote render continues server-side). */
  useEffect(() => {
    if (!activeJobsStorageReady) return;

    for (const job of activeJobs) {
      if (!job.taskId || job.phase === "failed") continue;
      if (adsStudioPollingStartedRef.current.has(job.id)) continue;
      adsStudioPollingStartedRef.current.add(job.id);

      const jobId = job.id;
      const taskId = job.taskId;
      void (async () => {
        const personalApiKey = getPersonalApiKey();
        const piapiApiKey = getPersonalPiapiApiKey();
        try {
          const vUrl = await pollVideo(taskId, personalApiKey ?? undefined, piapiApiKey ?? undefined);
          if (adsStudioDismissedJobIdsRef.current.has(jobId)) {
            adsStudioDismissedJobIdsRef.current.delete(jobId);
            return;
          }
          const p = (job.promptFull ?? job.promptSnippet).trim() || " ";
          const snapAssetType = job.jobAssetType ?? "product";
          const previewStillUrl = job.previewStillUrl ?? job.thumbUrl;
          const historyId = crypto.randomUUID();
          const item: AdsStudioHistoryItem = {
            id: historyId,
            createdAt: Date.now(),
            assetType: snapAssetType,
            prompt: p,
            imageUrl: previewStillUrl,
            videoUrl: vUrl,
            productRefUrl: job.productRefUrl ?? undefined,
            avatarRefUrl: job.avatarRefUrl ?? undefined,
          };
          setHistory((prev) => [item, ...prev].slice(0, 24));

          setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));

          setSelectedSidebarKey(`history:${historyId}`);

          toast.success("Ads Studio generation complete");
        } catch (err) {
          if (adsStudioDismissedJobIdsRef.current.has(jobId)) {
            adsStudioDismissedJobIdsRef.current.delete(jobId);
            return;
          }
          logGenerationFailure("ads-studio.resume-poll", err, { jobId, taskId });
          const msg = userMessageFromCaughtError(err);
          setActiveJobs((prev) =>
            prev.map((j) => (j.id === jobId ? { ...j, phase: "failed" as const, error: msg } : j)),
          );
          toast.error("Ads Studio", { description: msg });
        }
      })();
    }
  }, [activeJobs, activeJobsStorageReady]);

  function removeActiveJob(jobId: string) {
    adsStudioDismissedJobIdsRef.current.add(jobId);
    adsStudioPollingStartedRef.current.delete(jobId);
    setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));
    setSelectedSidebarKey((k) => (k === `job:${jobId}` ? null : k));
    setProjectDetail((d) => (d?.kind === "job" && d.id === jobId ? null : d));
    toast.message("Project removed");
  }

  function removeHistoryItem(historyId: string) {
    setHistory((prev) => prev.filter((h) => h.id !== historyId));
    setSelectedSidebarKey((k) => (k === `history:${historyId}` ? null : k));
    setProjectDetail((d) => (d?.kind === "history" && d.id === historyId ? null : d));
    toast.message("Project removed");
  }

  function scrollComposerIntoView() {
    if (typeof window === "undefined") return;

    /** Room for sticky studio chrome (mobile header ~56px + padding). */
    const STICKY_TOP_RESERVE = 96;

    const align = (behavior: ScrollBehavior) => {
      const node = composerPanelRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const y = window.scrollY + rect.top - STICKY_TOP_RESERVE;
      window.scrollTo({ top: Math.max(0, y), behavior });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => align("smooth"));
    });
    // Re-align after React commits and after reference thumbnails finish loading layout.
    window.setTimeout(() => align("auto"), 180);
    window.setTimeout(() => align("auto"), 420);
    window.setTimeout(() => align("auto"), 900);
  }

  async function recreateFromTemplate(
    label: string,
    tpl: TemplateVideoItem | undefined,
    templateGalleryKind: AdsStudioTemplateGalleryKind,
  ) {
    const n = normalizeTemplateLabel(label);
    const isTutorial2 =
      n.includes("tutorial 2") || n.includes("tutorial2") || n.includes("tutorial (2)");
    const isApp0504_1_3 = isAppTemplate050413BundledRecreateLabel(n);
    const nextPrompt = promptForTemplateLabel(label).replace(/\r\n/g, "\n");
    // Always replace current prompt (never append), even when input already contains text.
    setPrompt(nextPrompt);
    scrollComposerIntoView();
    const recreateAssetType: "product" | "app" = templateGalleryKind === "app" ? "app" : "product";
    setAssetType(recreateAssetType);
    if (isAppTemplate050411BundledRecreateLabel(n)) {
      setAssetType("app");
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_1_APP_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_1_AVATAR_PATH));
      return;
    }
    if (isAppTemplate050414BundledRecreateLabel(n)) {
      setAssetType("app");
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_4_APP_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_4_AVATAR_PATH));
      return;
    }
    if (isAppTemplate050415BundledRecreateLabel(n)) {
      setAssetType("app");
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_5_APP_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_5_AVATAR_PATH));
      return;
    }
    if (isAppTemplate050416BundledRecreateLabel(n)) {
      setAssetType("app");
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_6_APP_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_6_AVATAR_PATH));
      return;
    }
    if (isAppTemplate050417BundledRecreateLabel(n)) {
      setAssetType("app");
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_7_APP_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_7_AVATAR_PATH));
      return;
    }
    if (isAppTemplate050418BundledRecreateLabel(n)) {
      setAssetType("app");
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_8_APP_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_8_AVATAR_PATH));
      return;
    }
    if (isAppTemplate0504110BundledRecreateLabel(n)) {
      setAssetType("app");
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_10_APP_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_1_10_AVATAR_PATH));
      return;
    }
    if (isAppTemplate0504Bare1BundledRecreateLabel(n)) {
      setAssetType("app");
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_BASE_1_APP_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_APP_0504_BASE_1_AVATAR_PATH));
      return;
    }
    if (isApp0504_1_3) {
      // App slot → @image1, Avatar slot → @image2. Do not capture frames from the template
      // preview video (users upload their own app UI + avatar stills).
      setAssetType("app");
      setAppRefUrl("");
      setAvatarUrl("");
      scrollComposerIntoView();
      return;
    }
    if (isTutorial2) {
      const avatarResolved = resolveAdsStudioPublicImage(ADS_STUDIO_TUTORIAL_2_AVATAR_PATH);
      const productResolved = resolveAdsStudioPublicImage(ADS_STUDIO_TUTORIAL_2_PRODUCT_PATH);
      setAppRefUrl(productResolved);
      setAvatarUrl(avatarResolved);
      return;
    }
    if (isHyperMotionTemplateLabel(n)) {
      setAppRefUrl("");
      setAvatarUrl("");
      return;
    }
    if (isTutorialStandardTemplateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_TUTORIAL_STANDARD_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_TUTORIAL_STANDARD_AVATAR_PATH));
      return;
    }
    if (isProTryOnTemplateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_PRO_TRY_ON_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_PRO_TRY_ON_AVATAR_PATH));
      return;
    }
    if (isVirtualTryOn2BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_VIRTUAL_TRY_ON_2_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_VIRTUAL_TRY_ON_2_AVATAR_PATH));
      return;
    }
    if (isTryOn3BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_TRY_ON_3_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_TRY_ON_3_AVATAR_PATH));
      return;
    }
    if (isTryOn4BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_TRY_ON_4_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_TRY_ON_4_AVATAR_PATH));
      return;
    }
    if (isTryOn5BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_TRY_ON_5_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_TRY_ON_5_AVATAR_PATH));
      return;
    }
    if (isTryOn6NoRefsBundledRecreateLabel(n)) {
      setAppRefUrl("");
      setAvatarUrl("");
      return;
    }
    if (isGenericUgcTryOnBundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_TRY_ON_STREET_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_TRY_ON_STREET_AVATAR_PATH));
      return;
    }
    if (isUgcWomanBundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_WOMAN_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_WOMAN_AVATAR_PATH));
      return;
    }
    if (isUgc2BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_2_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_2_AVATAR_PATH));
      return;
    }
    if (isUgc3BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_3_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_3_AVATAR_PATH));
      return;
    }
    if (isUgc4BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_4_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_4_AVATAR_PATH));
      return;
    }
    if (isUgc5BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_5_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_5_AVATAR_PATH));
      return;
    }
    if (isUgc6BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_6_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UGC_6_AVATAR_PATH));
      return;
    }
    if (isUnboxing2BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UNBOXING_2_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UNBOXING_2_AVATAR_PATH));
      return;
    }
    if (isUnboxing3BundledProductOnlyRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UNBOXING_3_PRODUCT_PATH));
      setAvatarUrl("");
      return;
    }
    if (isUnboxing4BundledRecreateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UNBOXING_4_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UNBOXING_4_AVATAR_PATH));
      return;
    }
    if (isBundledFroggyUnboxingTemplateLabel(n)) {
      setAppRefUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UNBOXING_PRODUCT_PATH));
      setAvatarUrl(resolveAdsStudioPublicImage(ADS_STUDIO_UNBOXING_AVATAR_PATH));
      return;
    }

    const tplUrl = tpl?.url?.trim();
    if (tplUrl) {
      setUploadingRefSlot(true);
      setUploadingAvatar(true);
      try {
        toast.message("Uploading template references…", {
          description: "Capturing two frames and uploading Product + Avatar.",
        });
        const { productUrl, avatarUrl } = await uploadTemplateRefsFromPreviewVideo(tplUrl);
        setAppRefUrl(productUrl);
        setAvatarUrl(avatarUrl);
        toast.success("References added", {
          description: "Two frames from the template preview were uploaded for Product and Avatar.",
        });
      } catch {
        toast.message("References not filled automatically", {
          description: "Upload Product and Avatar manually to match this template.",
        });
      } finally {
        setUploadingRefSlot(false);
        setUploadingAvatar(false);
      }
      scrollComposerIntoView();
    }
  }

  const projectDetailResolved = useMemo(() => {
    if (!projectDetail) return null;
    if (projectDetail.kind === "history") {
      const item = history.find((h) => h.id === projectDetail.id);
      return item ? ({ kind: "history" as const, item } as const) : null;
    }
    const job = activeJobs.find((j) => j.id === projectDetail.id);
    return job ? ({ kind: "job" as const, job } as const) : null;
  }, [projectDetail, history, activeJobs]);

  useEffect(() => {
    if (projectDetail && !projectDetailResolved) setProjectDetail(null);
  }, [projectDetail, projectDetailResolved]);

  const loadProjectDetailIntoComposer = useCallback(() => {
    if (!projectDetailResolved) return;
    if (projectDetailResolved.kind === "history") {
      const h = projectDetailResolved.item;
      setPrompt(h.prompt);
      setAssetType(h.assetType);
      const p = h.productRefUrl?.trim();
      const a = h.avatarRefUrl?.trim();
      if (p || a) {
        setAppRefUrl(p ?? "");
        setAvatarUrl(a ?? "");
      } else {
        setAppRefUrl(h.imageUrl?.trim() ?? "");
        setAvatarUrl("");
      }
    } else {
      const j = projectDetailResolved.job;
      setPrompt((j.promptFull ?? j.promptSnippet).trim());
      setAssetType(j.jobAssetType ?? "product");
      const p = j.productRefUrl?.trim();
      const a = j.avatarRefUrl?.trim();
      if (p || a) {
        setAppRefUrl(p ?? "");
        setAvatarUrl(a ?? "");
      } else {
        setAppRefUrl((j.previewStillUrl ?? j.thumbUrl ?? "").trim());
        setAvatarUrl("");
      }
    }
    setProjectDetail(null);
    scrollComposerIntoView();
  }, [projectDetailResolved]);

  const renderAdsGradientComposerCard = () => (
    <div className="relative w-full min-w-0 max-w-[1080px] rounded-[20px]">
      <div className="relative rounded-[20px] bg-[linear-gradient(0deg,rgba(21,21,21,0.88)_0%,rgba(21,21,21,0.88)_100%),linear-gradient(41deg,rgba(101,189,235,0.24)_25.53%,rgba(101,189,235,0.00)_63.06%)] p-4 shadow-[0_12px_8px_0_rgba(0,0,0,0.20),inset_0_0_0_1px_rgba(255,255,255,0.07)] backdrop-blur-[20px]">
        <div className="flex w-full min-w-0 flex-col gap-3 rounded-[20px] sm:flex-row sm:items-start">
          <div
            className="relative z-20 order-first flex w-full min-h-[52px] shrink-0 gap-1 rounded-[20px] bg-[rgba(0,0,0,0.05)] p-1 shadow-[0_12px_8px_0_rgba(0,0,0,0.20),inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-[20px] sm:order-none sm:h-[120px] sm:min-h-0 sm:w-[70px] sm:flex-col sm:justify-center"
            aria-label="Product or App ad mode"
          >
            <button
              type="button"
              onClick={() => setAssetType("product")}
              className={cn(
                "relative z-0 flex min-h-0 min-w-0 flex-1 basis-0 flex-row items-center justify-center gap-2 rounded-[16px] px-2 py-2 text-[10px] font-semibold leading-[14px] transition-colors sm:flex-col sm:gap-1 sm:py-1.5",
                assetType === "product" ? "bg-white/[0.06] text-white" : "text-white/50 hover:text-white/70",
              )}
            >
              <Package2 className="size-4 shrink-0" />
              <span>Product</span>
            </button>
            <button
              type="button"
              onClick={() => setAssetType("app")}
              className={cn(
                "relative z-0 flex min-h-0 min-w-0 flex-1 basis-0 flex-row items-center justify-center gap-2 rounded-[16px] px-2 py-2 text-[10px] font-semibold leading-[14px] transition-colors sm:flex-col sm:gap-1 sm:py-1.5",
                assetType === "app" ? "bg-white/[0.06] text-white" : "text-white/50 hover:text-white/70",
              )}
            >
              <Smartphone className="size-4 shrink-0" />
              <span>App</span>
            </button>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3">
            <div className="grid w-full min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] content-start gap-x-2 gap-y-2">
              <button
                type="button"
                className="col-start-1 row-start-1 mt-1 flex size-7 shrink-0 items-center justify-center self-start rounded-lg bg-white/[0.04] text-white/85 shadow-[0_2px_1.5px_-0.5px_rgba(0,0,0,0.1)]"
              >
                <Plus className="size-3.5" />
              </button>
              <div className="relative z-20 col-start-2 row-start-1 min-w-0">
                <ElementMentionTextarea
                  value={prompt}
                  onChange={setPrompt}
                  placeholder="Describe the ad. Type @ to insert Product, Avatar, or library avatars (@image1 / @image2 match uploaded references)."
                  rows={5}
                  elements={mentionElementOptions}
                  mentionTabs={adsMentionTabs}
                  minimalScrollbar
                  copySyncClassName="max-h-[min(248px,40vh)] min-h-36 pb-10 pr-0.5 text-sm leading-relaxed md:text-sm md:leading-relaxed text-white/90"
                  textareaClassName="caret-violet-300 placeholder:text-white/35"
                  onPickElement={handlePickMentionElement}
                  emptyElementsHint={
                    avatarLibLoading
                      ? "Loading avatar library…"
                      : "Upload Product or App and Avatar references above, then type @ to insert @image1 / @image2."
                  }
                  showCreateElementButton={false}
                  className={cn(
                    "max-h-[min(288px,46vh)] min-h-36 w-full overflow-hidden rounded-xl border-0 bg-transparent shadow-none ring-0",
                    "focus-within:ring-0",
                  )}
                />
                <PromptEnhanceCornerButton value={prompt} onApply={setPrompt} surface="ads" />
              </div>

              <div className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5">
                <Select value={outputAspect} onValueChange={(v) => setOutputAspect(v as AdsStudioOutputAspect)}>
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-auto min-w-[2.5rem] max-w-[4rem] shrink-0 justify-center gap-0.5 rounded-md border-white/12 bg-white/[0.04] px-1.5 text-[11px] tabular-nums text-white shadow-none hover:bg-white/[0.07]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className={studioSelectContentClass}>
                    {ADS_STUDIO_SEEDANCE_ASPECTS.map((ar) => (
                      <SelectItem key={ar} value={ar} className={studioSelectItemClass}>
                        {ar === "auto" ? "Auto" : ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={videoResolution} onValueChange={(v) => setVideoResolution(v as AdsStudioVideoResolution)}>
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-[min(100%,4.75rem)] rounded-md border-white/12 bg-white/[0.04] px-2 text-[11px] text-white shadow-none hover:bg-white/[0.07]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className={studioSelectContentClass}>
                    {ADS_STUDIO_SEEDANCE_RESOLUTIONS.map((r) => (
                      <SelectItem key={r} value={r} className={studioSelectItemClass}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(videoDurationSec)} onValueChange={(v) => setVideoDurationSec(Number(v))}>
                  <SelectTrigger
                    size="sm"
                    className="h-7 w-[min(100%,3.75rem)] rounded-md border-white/12 bg-white/[0.04] px-2 text-[11px] text-white shadow-none hover:bg-white/[0.07]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className={studioSelectContentClass}>
                    {ADS_STUDIO_DURATION_CHOICES.map((d) => (
                      <SelectItem key={d} value={String(d)} className={studioSelectItemClass}>
                        {d}s
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-start justify-end gap-1.5">
              <div className="group relative flex h-20 w-[80px] flex-col items-start justify-between overflow-hidden rounded-xl bg-white/[0.05] p-1.5 shadow-[10px_34px_24px_0_rgba(0,0,0,0.15),1px_3px_4px_0_rgba(0,0,0,0.32),0px_1px_2px_0_rgba(0,0,0,0.32)]">
                {uploadingRefSlot ? (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-black/60 backdrop-blur-[2px]">
                    <Loader2 className="size-6 shrink-0 animate-spin text-white" aria-hidden />
                    <span className="text-center text-[9px] font-semibold uppercase leading-tight text-white/95">Uploading</span>
                  </div>
                ) : null}
                {!uploadingRefSlot && !appRefUrl.trim() ? (
                  <button
                    type="button"
                    aria-label={assetType === "app" ? "Upload app reference photo" : "Upload product reference photo"}
                    disabled={uploadingRefSlot}
                    onClick={() => appInputRef.current?.click()}
                    className="absolute inset-0 z-10 flex flex-col items-start justify-between p-1.5 text-left transition hover:bg-white/[0.04] disabled:pointer-events-none"
                  >
                    <div className="absolute inset-0 rounded-xl bg-white/[0.05]" />
                    <span className="relative z-10 inline-flex size-5 items-center justify-center rounded-full border border-white/30 bg-white/[0.06]">
                      <Plus className="size-3 text-white" />
                    </span>
                    <p className="relative z-10 mt-auto text-[12px] font-bold uppercase text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]">
                      {assetType === "app" ? "App" : "Product"}
                    </p>
                  </button>
                ) : null}
                {!uploadingRefSlot && appRefUrl.trim() ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- user/CDN URL */}
                    <img
                      src={appRefUrl.trim()}
                      alt={assetType === "app" ? "App reference" : "Product reference"}
                      className="absolute inset-0 h-full w-full rounded-xl object-cover"
                    />
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-transparent to-[#202020]" />
                    <div className="pointer-events-none absolute left-1 right-1 top-1 z-20 flex justify-between gap-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label="Choose product reference source"
                        className="pointer-events-auto inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-white/35 bg-black/45 text-white shadow backdrop-blur-[2px] transition hover:bg-black/60"
                        onClick={() => {
                          setRefSourceDialogMode("product");
                          setRefSourceDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove product reference"
                        className="pointer-events-auto inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-white/35 bg-black/45 text-white shadow backdrop-blur-[2px] transition hover:bg-black/60"
                        onClick={() => setAppRefUrl("")}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                    <p className="relative z-10 mt-auto text-[12px] font-bold uppercase text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]">
                      {assetType === "app" ? "App" : "Product"}
                    </p>
                  </>
                ) : null}
              </div>
              <div className="group relative flex h-20 w-[80px] flex-col items-start justify-between overflow-hidden rounded-xl p-1.5 shadow-[10px_34px_24px_0_rgba(0,0,0,0.15),1px_3px_4px_0_rgba(0,0,0,0.32),0px_1px_2px_0_rgba(0,0,0,0.32)]">
                {uploadingAvatar ? (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-black/60 backdrop-blur-[2px]">
                    <Loader2 className="size-6 shrink-0 animate-spin text-white" aria-hidden />
                    <span className="text-center text-[9px] font-semibold uppercase leading-tight text-white/95">Uploading</span>
                  </div>
                ) : null}
                {!uploadingAvatar && !avatarUrl.trim() ? (
                  <button
                    type="button"
                    aria-label="Upload avatar photo"
                    disabled={uploadingAvatar}
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute inset-0 z-10 flex flex-col items-start justify-between p-1.5 text-left transition hover:bg-white/[0.04] disabled:pointer-events-none"
                  >
                    <div className="absolute inset-0 rounded-xl bg-white/[0.05]" />
                    <span className="relative z-10 inline-flex size-5 items-center justify-center rounded-full border border-white/30 bg-white/[0.06]">
                      <Plus className="size-3 text-white" />
                    </span>
                    <p className="relative z-10 mt-auto text-[12px] font-bold uppercase text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]">
                      Avatar
                    </p>
                  </button>
                ) : null}
                {!uploadingAvatar && avatarUrl.trim() ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- user/CDN URL */}
                    <img src={avatarUrl.trim()} alt="Avatar" className="absolute inset-0 h-full w-full rounded-xl object-cover" />
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-transparent to-[#202020]" />
                    <div className="pointer-events-none absolute left-1 right-1 top-1 z-20 flex justify-between gap-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label="Choose avatar reference source"
                        className="pointer-events-auto inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-white/35 bg-black/45 text-white shadow backdrop-blur-[2px] transition hover:bg-black/60"
                        onClick={() => {
                          setRefSourceDialogMode("avatar");
                          setRefSourceDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove avatar reference"
                        className="pointer-events-auto inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-white/35 bg-black/45 text-white shadow backdrop-blur-[2px] transition hover:bg-black/60"
                        onClick={() => setAvatarUrl("")}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>
                    <p className="relative z-10 mt-auto text-[12px] font-bold uppercase text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.75)]">
                      Avatar
                    </p>
                  </>
                ) : null}
              </div>
              <Button
                type="button"
                onClick={() => void runGenerate()}
                className="flex h-[88px] w-[152px] shrink-0 items-center justify-center rounded-xl border border-violet-300/40 bg-violet-500 px-3 text-base font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none"
              >
                <span className="inline-flex flex-wrap items-center justify-center gap-2">
                  Generate
                  {hasSubmittingJob ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
                  )}
                  {generationCredits > 0 ? (
                    <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums" title="Credits for this generation">
                      {generationCredits}
                    </span>
                  ) : null}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-w-0 pb-8 [--ads-projects-w:220px]">
      <aside
        aria-label="Projects"
        className={cn(
          "z-[22] flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#09090b]/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md",
          "mb-3 sm:mb-4",
          "md:fixed md:mb-0 md:left-[var(--studio-nav-w,248px)] md:top-0 md:h-dvh md:max-h-none md:w-[var(--ads-projects-w)] md:max-w-[var(--ads-projects-w)] md:rounded-none md:border-b-0 md:border-l-0 md:border-t-0 md:border-r md:border-white/10 md:shadow-none",
        )}
      >
          <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.08] px-3 py-2.5">
            <LayoutList className="size-4 shrink-0 text-violet-300/90" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wide text-white/65">Projects</span>
            {runningJobCount > 0 ? (
              <span className="ml-auto rounded-full bg-violet-500/25 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-violet-100 ring-1 ring-violet-400/25">
                {runningJobCount} active
              </span>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-2 md:py-3 max-h-[min(280px,42vh)] md:max-h-none">
            {activeJobs.length === 0 && history.length === 0 ? (
              <p className="px-1 py-6 text-center text-[11px] leading-snug text-white/40">
                Generations show up here. Start another anytime — jobs run in the background.
              </p>
            ) : null}
            {activeJobs.map((job) => {
              const selected =
                selectedSidebarKey === `job:${job.id}` ||
                (projectDetail?.kind === "job" && projectDetail.id === job.id);
              return (
                <div
                  key={job.id}
                  className={cn(
                    "group flex w-full items-stretch gap-0.5 rounded-xl border px-1 py-1 transition",
                    selected ? "border-violet-400/45 bg-white/[0.07]" : "border-transparent bg-white/[0.03] hover:bg-white/[0.06]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSidebarKey(`job:${job.id}`);
                      setProjectDetail({ kind: "job", id: job.id });
                    }}
                    className="flex min-w-0 flex-1 gap-2 rounded-lg px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                  >
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-black/40">
                      {job.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote CDN thumbs
                        <img src={job.thumbUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-white/35">—</div>
                      )}
                      {(job.phase === "submitting" || job.phase === "rendering") ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                          <Loader2 className="size-5 animate-spin text-white" aria-hidden />
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white/90">{job.promptSnippet}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                        {job.phase === "failed"
                          ? "Failed"
                          : job.phase === "submitting"
                            ? "Submitting…"
                            : "Rendering…"}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete project"
                    title="Remove from list"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeActiveJob(job.id);
                    }}
                    className="flex shrink-0 items-center justify-center rounded-lg border border-transparent px-1 text-white/35 transition hover:border-white/15 hover:bg-white/[0.08] hover:text-rose-300/95"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              );
            })}
            {history.map((h) => {
              const selected =
                selectedSidebarKey === `history:${h.id}` ||
                (projectDetail?.kind === "history" && projectDetail.id === h.id);
              return (
                <div
                  key={h.id}
                  className={cn(
                    "group flex w-full items-stretch gap-0.5 rounded-xl border px-1 py-1 transition",
                    selected ? "border-violet-400/45 bg-white/[0.07]" : "border-transparent bg-white/[0.03] hover:bg-white/[0.06]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSidebarKey(`history:${h.id}`);
                      setProjectDetail({ kind: "history", id: h.id });
                    }}
                    className="flex min-w-0 flex-1 gap-2 rounded-lg px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                  >
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-black/40">
                      {h.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote CDN thumbs
                        <img src={h.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[9px] text-white/40">Clip</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white/90">
                        {h.prompt.length > 90 ? `${h.prompt.slice(0, 87)}…` : h.prompt}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">Ready</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete project"
                    title="Remove from list"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeHistoryItem(h.id);
                    }}
                    className="flex shrink-0 items-center justify-center rounded-lg border border-transparent px-1 text-white/35 transition hover:border-white/15 hover:bg-white/[0.08] hover:text-rose-300/95"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
      </aside>

        <div
          className={cn(
            "box-border flex w-full min-w-0 flex-col items-center gap-10 pb-2 md:gap-12",
            /* Padding (not margin) reserves the fixed Projects rail without breaking `w-full` centering. */
            "px-3 sm:px-5",
            "md:pl-[calc(var(--ads-projects-w)+1.5rem)] md:pr-6",
            "lg:pl-[calc(var(--ads-projects-w)+2.5rem)] lg:pr-10",
          )}
        >
          <div
            ref={composerPanelRef}
            className="mx-auto flex w-full max-w-[1080px] min-w-0 flex-col items-center gap-4 scroll-mt-20 pt-8 sm:pt-10 md:scroll-mt-28 md:gap-5 md:pt-14 lg:pt-16"
          >
          <h2 className="relative max-w-[44rem] px-3 text-center text-[1.625rem] font-semibold leading-[1.18] tracking-tight sm:text-3xl sm:leading-[1.15] md:text-[2.125rem] md:leading-[1.12]">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-4 top-1/2 -z-10 h-[62%] -translate-y-1/2 rounded-full bg-violet-500/14 blur-[46px] md:inset-x-8"
            />
            <span className="bg-gradient-to-br from-white via-zinc-100 to-violet-300/85 bg-clip-text text-transparent">
              Turn any product into a video ad
            </span>
          </h2>
          {selectedFailedJobMessage ? (
            <div
              role="alert"
              className="mx-auto w-full max-w-[1080px] rounded-xl border border-rose-400/35 bg-rose-950/45 px-4 py-3 text-left shadow-[0_8px_28px_rgba(0,0,0,0.25)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-200/90">Ads Studio</p>
              <p className="mt-1 text-sm leading-snug text-rose-50/95">{selectedFailedJobMessage}</p>
            </div>
          ) : null}
          <div className="flex min-h-[min(58vh,540px)] w-full min-w-0 justify-center">{renderAdsGradientComposerCard()}</div>
          <input
            ref={appInputRef}
            type="file"
            accept={STUDIO_IMAGE_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadRef(f, "app");
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={avatarInputRef}
            type="file"
            accept={STUDIO_IMAGE_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadRef(f, "avatar");
              e.currentTarget.value = "";
            }}
          />
          <AdsStudioRefSourceDialog
            open={refSourceDialogOpen}
            onOpenChange={setRefSourceDialogOpen}
            mode={refSourceDialogMode}
            onPickUrl={(url) => {
              if (refSourceDialogMode === "product") setAppRefUrl(url);
              else setAvatarUrl(url);
            }}
            onRequestFileUpload={() => {
              if (refSourceDialogMode === "product") appInputRef.current?.click();
              else avatarInputRef.current?.click();
            }}
          />
        </div>

      <section className="w-full min-w-0">
        <div className="mb-5 flex flex-col items-center gap-3 sm:mb-6">
          <h2 className="flex items-center gap-2.5 text-center text-xl font-semibold tracking-tight text-white sm:gap-3 sm:text-2xl md:text-[1.75rem] md:leading-snug">
            <Zap
              className="size-7 shrink-0 text-fuchsia-400 drop-shadow-[0_0_14px_rgba(232,121,249,0.55)] sm:size-8 md:size-9"
              aria-hidden
              strokeWidth={2.35}
            />
            Generate across formats
          </h2>
          <div
            className="flex rounded-full border border-white/10 bg-black/35 p-0.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
            role="tablist"
            aria-label="Template gallery"
          >
            <button
              type="button"
              role="tab"
              aria-selected={adsTemplateGalleryKind === "product"}
              onClick={() => setAdsTemplateGalleryKind("product")}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition sm:px-4",
                adsTemplateGalleryKind === "product"
                  ? "bg-white/[0.12] text-white shadow-sm ring-1 ring-white/15"
                  : "text-white/50 hover:text-white/75",
              )}
            >
              Product
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={adsTemplateGalleryKind === "app"}
              onClick={() => setAdsTemplateGalleryKind("app")}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition sm:px-4",
                adsTemplateGalleryKind === "app"
                  ? "bg-white/[0.12] text-white shadow-sm ring-1 ring-white/15"
                  : "text-white/50 hover:text-white/75",
              )}
            >
              App
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {templateVideos.map((tpl, idx) => {
            const label = tpl.label || `Template ${idx + 1}`;
            const templateUrl = tpl.url;
            const previewUrl = templateUrl ?? presetPreviewVideos[idx] ?? null;
            return (
              <div
                key={tpl.filename || templateUrl}
                className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-black/35"
                onMouseEnter={(e) => {
                  const video = e.currentTarget.querySelector("video");
                  if (video) void video.play().catch(() => undefined);
                }}
                onMouseLeave={(e) => {
                  const video = e.currentTarget.querySelector("video");
                  if (video) {
                    video.pause();
                    video.currentTime = 0;
                  }
                }}
              >
                {previewUrl ? (
                  <video
                    src={previewUrl}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-violet-900/35 via-[#15141f] to-[#0a0a11] text-[11px] font-semibold text-white/35">
                    Missing preview
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/60" />
                <p className="pointer-events-none absolute left-3 top-2 text-[11px] font-semibold text-white/90">{label}</p>
                <button
                  type="button"
                  onClick={() => void recreateFromTemplate(label, tpl, adsTemplateGalleryKind)}
                  className={cn(
                    "absolute bottom-3 left-1/2 z-20 flex h-9 -translate-x-1/2 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white opacity-0 shadow-[0_4px_0_0_rgba(76,29,149,0.88)] ring-1 ring-violet-300/35 transition",
                    "border border-violet-300/45 bg-violet-500 hover:bg-violet-400 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.88)] active:-translate-x-1/2 active:translate-y-px active:shadow-none",
                    "group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/55",
                  )}
                >
                  <Sparkles className="size-3.5 shrink-0 opacity-95" aria-hidden />
                  Recreate
                </button>
              </div>
            );
          })}
          {templateVideos.length === 0 ? (
            <div className="col-span-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
              {adsTemplateGalleryKind === "app" ? (
                <>
                  No app template videos yet. Add <code className="text-white/65">.mp4</code> (or{" "}
                  <code className="text-white/65">.webm</code> / <code className="text-white/65">.mov</code>) under{" "}
                  <code className="text-white/65">/public/studio/template-app</code> or new previews under{" "}
                  <code className="text-white/65">/public/studio/app-template-preview</code> — both folders are listed
                  together (same idea as product templates in <code className="text-white/65">/template</code>).
                </>
              ) : (
                <>
                  No template videos found in <code className="text-white/65">/public/studio/template</code>.
                </>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <Dialog.Root
        open={projectDetailResolved !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setProjectDetail(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[530] bg-black/75 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[531] flex max-h-[min(92vh,720px)] min-h-0 w-[min(96vw,980px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#101014] shadow-[0_24px_80px_rgba(0,0,0,0.75)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <Dialog.Title className="text-base font-semibold text-white">
                {projectDetailResolved?.kind === "history"
                  ? "Saved clip"
                  : projectDetailResolved?.job.phase === "failed"
                    ? "Generation failed"
                    : "Generation in progress"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              View the video output, prompt, and reference images for this Ads Studio project.
            </Dialog.Description>

            {projectDetailResolved?.kind === "history" ? (
              <AdsStudioProjectDetailBody
                kind="history"
                item={projectDetailResolved.item}
                onLoadIntoComposer={loadProjectDetailIntoComposer}
              />
            ) : projectDetailResolved?.kind === "job" ? (
              <AdsStudioProjectDetailBody
                kind="job"
                job={projectDetailResolved.job}
                onLoadIntoComposer={loadProjectDetailIntoComposer}
              />
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
        </div>
    </div>
  );
}

