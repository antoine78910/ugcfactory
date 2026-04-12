/**
 * Motion control UI: `background_source` (Kling 3.0) vs mapped `character_orientation` (Kling 2.6).
 *
 * @see ugc-automation/docs/PROVIDER_MODEL_API_INDEX.md
 */

export type MotionControlKieFamily = "kling-3.0" | "kling-2.6";

export type MotionBackgroundSource = "input_video" | "input_image";

export function motionControlBackgroundSourceDescription(family: MotionControlKieFamily): string {
  if (family === "kling-2.6") {
    return (
      "Kling 2.6 uses `character_orientation` (no separate `background_source`). " +
      "Video background: motion from the reference clip (up to 30s). " +
      "Image background: align to the character still (reference clip up to 10s)."
    );
  }
  return (
    "Kling 3.0: `background_source` selects whether the output scene follows the motion clip " +
    "or the character image; orientation is paired automatically when not overridden."
  );
}
