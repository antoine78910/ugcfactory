import { Inter, Montserrat, Poppins } from "next/font/google";

/** Self-hosted via next/font so canvas + MediaRecorder get real faces (no runtime Google CDN). */
export const clippingHookMontserrat = Montserrat({
  subsets: ["latin"],
  weight: "900",
  display: "swap",
  preload: true,
});

export const clippingHookInter = Inter({
  subsets: ["latin"],
  weight: "900",
  display: "swap",
  preload: true,
});

export const clippingHookPoppins = Poppins({
  subsets: ["latin"],
  weight: "900",
  display: "swap",
  preload: true,
});

const WEB_FONT_IDS = ["Montserrat", "Inter", "Poppins"] as const;
export type ClippingHookWebFontId = (typeof WEB_FONT_IDS)[number];

export function isClippingHookWebFont(fontId: string): fontId is ClippingHookWebFontId {
  return (WEB_FONT_IDS as readonly string[]).includes(fontId);
}

export function canvasFontFamilyForHookTitle(fontId: string): string {
  switch (fontId) {
    case "Montserrat":
      return clippingHookMontserrat.style.fontFamily;
    case "Inter":
      return clippingHookInter.style.fontFamily;
    case "Poppins":
      return clippingHookPoppins.style.fontFamily;
    case "Helvetica Neue":
      return '"Helvetica Neue", Helvetica, Arial, sans-serif';
    case "Arial":
    default:
      return "Arial, Helvetica, sans-serif";
  }
}

export function hookTitleCanvasFont(fontSizePx: number, fontId: string): string {
  return `900 ${fontSizePx}px ${canvasFontFamilyForHookTitle(fontId)}`;
}

const FONT_LOAD_TIMEOUT_MS = 8000;

/**
 * Waits until the hook-title face is available for canvas text (self-hosted or system).
 */
export async function ensureClippingHookTitleFont(
  fontId: string,
  fontSizePx: number,
): Promise<void> {
  if (typeof document === "undefined") return;

  const spec = hookTitleCanvasFont(fontSizePx, fontId);
  await document.fonts.ready;

  try {
    await document.fonts.load(spec);
  } catch {
    /* continue polling with check() */
  }

  const deadline = Date.now() + FONT_LOAD_TIMEOUT_MS;
  while (!document.fonts.check(spec) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    try {
      await document.fonts.load(spec);
    } catch {
      /* keep polling */
    }
  }
}

export async function preloadAllClippingHookTitleFonts(fontSizePx: number): Promise<void> {
  await Promise.all(
    WEB_FONT_IDS.map((fontId) => ensureClippingHookTitleFont(fontId, fontSizePx)),
  );
}

export function classNameForClippingHookWebFont(fontId: string): string | undefined {
  switch (fontId) {
    case "Montserrat":
      return clippingHookMontserrat.className;
    case "Inter":
      return clippingHookInter.className;
    case "Poppins":
      return clippingHookPoppins.className;
    default:
      return undefined;
  }
}
