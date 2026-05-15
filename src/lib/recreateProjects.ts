import type { RecreateAnalyzeResponse, RecreateScene } from "@/lib/recreateAnalysis";

export type RecreateProjectStatus = "in_progress" | "archived";

export type RecreateKeyframeSlotStatus = "idle" | "processing" | "ready" | "error";

export type RecreateKeyframeSlot = {
  status: RecreateKeyframeSlotStatus;
  taskId?: string;
  outputUrl?: string;
  error?: string;
  updatedAt?: string;
};

export type RecreateSceneKeyframes = {
  start: RecreateKeyframeSlot;
  end: RecreateKeyframeSlot;
};

export type RecreateProjectClientState = {
  scriptDraft?: string;
  scriptApproved?: boolean;
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

export function buildRecreateProductSwapPrompt(opts: {
  scene: RecreateScene;
  role: "start" | "end";
}): string {
  const { scene, role } = opts;
  const beat = role === "start" ? scene.startDescription ?? "" : scene.endDescription ?? "";
  const style = scene.visualStyleCategory ?? "unknown";
  const bg = scene.backgroundDescription ?? "";
  const light = scene.lightingAndGradeNotes ?? "";
  const notes = scene.recreationNotes ?? "";

  return [
    "Recreate this advertising frame for a new brand.",
    `Shot: ${scene.sceneId} (${role} of scene).`,
    `Keep the same camera angle, framing, background layout, lighting direction, color grade, and talent blocking as reference image 1.`,
    "Replace any generic or competitor product with the product, packaging, and logo shown in the following reference images.",
    "Do not add watermarks or UI overlays.",
    `Production style lane: ${style}.`,
    beat ? `What we see in this beat: ${beat}` : "",
    bg ? `Background / set: ${bg}` : "",
    light ? `Lighting & grade: ${light}` : "",
    notes ? `Recreation notes: ${notes}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
