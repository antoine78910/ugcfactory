"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Loader2, Upload, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type RecreateAnalyzeResponse } from "@/lib/recreateAnalysis";
import {
  emptySceneKeyframes,
  type RecreateProjectAssets,
  type RecreateSceneKeyframes,
} from "@/lib/recreateProjects";
import { RecreateResultsPanel } from "./RecreateResultsPanel";
import { RECREATE_SCENE_THRESHOLD } from "@/lib/recreateSceneDetection";
import { STUDIO_VIDEO_PICKER_IDS } from "@/lib/studioVideoModelCapabilities";
import { assertStudioVideoUpload, STUDIO_VIDEO_FILE_ACCEPT } from "@/lib/studioUploadValidation";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { toast } from "sonner";

type ClientLogEntry = {
  id: string;
  message: string;
};

type ProgressState = {
  durationSec: number;
  sourceUploaded: boolean;
  detectedScenes: number;
  analyzedKeyframes: number;
};

const INITIAL_PROGRESS: ProgressState = {
  durationSec: 0,
  sourceUploaded: false,
  detectedScenes: 0,
  analyzedKeyframes: 0,
};

const EMPTY_PROJECT_ASSETS: RecreateProjectAssets = {
  productImageUrl: null,
  packagingImageUrl: null,
  logoImageUrl: null,
};

function formatLogMessage(message: string): string {
  const stamp = new Date().toLocaleTimeString("en-US", { hour12: false });
  return `[${stamp}] ${message}`;
}

function formatSeconds(value: number): string {
  return `${value.toFixed(1)}s`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function loadVideoForAnalysis(objectUrl: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Video load timed out.")), 20000);
    video.onloadeddata = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("The selected video could not be decoded."));
    };
  });

  return video;
}

const STUDIO_PICKER_SET = new Set<string>(STUDIO_VIDEO_PICKER_IDS);

function pickValidStudioModelId(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  return STUDIO_PICKER_SET.has(v) ? v : "kling-3.0/video";
}

export function RecreateAnalysisClient() {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<ClientLogEntry[]>([]);
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS);
  const [result, setResult] = useState<RecreateAnalyzeResponse | null>(null);
  const [scriptDraft, setScriptDraft] = useState("");
  const [scriptApproved, setScriptApproved] = useState(false);
  const [sceneModelChoice, setSceneModelChoice] = useState<Record<string, string>>({});
  const [scenePromptOverrides, setScenePromptOverrides] = useState<Record<string, string>>({});
  const [productFile, setProductFile] = useState<File | null>(null);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectsList, setProjectsList] = useState<
    { id: string; title: string; updated_at: string; video_file_name: string | null }[]
  >([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectKeyframes, setProjectKeyframes] = useState<Record<string, RecreateSceneKeyframes>>({});
  const [keyframeRunning, setKeyframeRunning] = useState<string | null>(null);
  const [projectAssets, setProjectAssets] = useState<RecreateProjectAssets>(EMPTY_PROJECT_ASSETS);
  const [frameUploadBusy, setFrameUploadBusy] = useState<string | null>(null);
  const [globalUploadBusy, setGlobalUploadBusy] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const skipResultBootstrapRef = useRef(false);
  const allowProjectSaveRef = useRef(false);

  useEffect(() => {
    if (!result) return;
    if (skipResultBootstrapRef.current) {
      skipResultBootstrapRef.current = false;
      return;
    }
    setScriptApproved(false);
    setScriptDraft(result.creativeBrief?.fullVideoScriptDraft ?? "");
    setProductFile(null);
    const models: Record<string, string> = {};
    const prompts: Record<string, string> = {};
    for (const s of result.scenes) {
      models[s.sceneId] = pickValidStudioModelId(s.recommendedVideoModels?.[0]);
      prompts[s.sceneId] = s.videoGenerationPrompt ?? "";
    }
    setSceneModelChoice(models);
    setScenePromptOverrides(prompts);
  }, [result]);

  const appendLog = useCallback((message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        message: formatLogMessage(message),
      },
    ]);
  }, []);

  const refreshProjectsList = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res = await fetch("/api/recreate/projects", { cache: "no-store" });
      const json = (await res.json()) as unknown;
      if (Array.isArray(json)) {
        setProjectsList(
          json.map((r) => {
            const o = r as Record<string, unknown>;
            return {
              id: String(o.id ?? ""),
              title: String(o.title ?? "Project"),
              updated_at: String(o.updated_at ?? ""),
              video_file_name: o.video_file_name != null ? String(o.video_file_name) : null,
            };
          }),
        );
      }
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const loadProjectById = useCallback(async (id: string) => {
    allowProjectSaveRef.current = false;
    try {
      const res = await fetch(`/api/recreate/projects/${encodeURIComponent(id)}`, { cache: "no-store" });
      const row = (await res.json()) as {
        id?: string;
        error?: string;
        analysis_json?: RecreateAnalyzeResponse;
        keyframes_json?: Record<string, RecreateSceneKeyframes>;
        product_image_url?: string | null;
        packaging_image_url?: string | null;
        logo_image_url?: string | null;
        client_state_json?: {
          scriptDraft?: string;
          scriptApproved?: boolean;
          sceneModelChoice?: Record<string, string>;
          scenePromptOverrides?: Record<string, string>;
        };
      };
      if (!res.ok || !row?.id || !row.analysis_json) {
        toast.error(typeof row?.error === "string" ? row.error : "Could not load project.");
        return;
      }
      skipResultBootstrapRef.current = true;
      setProjectId(row.id);
      setProjectKeyframes((row.keyframes_json ?? {}) as Record<string, RecreateSceneKeyframes>);
      setProjectAssets({
        productImageUrl: row.product_image_url ?? null,
        packagingImageUrl: row.packaging_image_url ?? null,
        logoImageUrl: row.logo_image_url ?? null,
      });
      setResult(row.analysis_json);
      const cs = row.client_state_json ?? {};
      if (typeof cs.scriptDraft === "string") setScriptDraft(cs.scriptDraft);
      if (typeof cs.scriptApproved === "boolean") setScriptApproved(cs.scriptApproved);
      if (cs.sceneModelChoice && typeof cs.sceneModelChoice === "object") {
        setSceneModelChoice(cs.sceneModelChoice as Record<string, string>);
      }
      if (cs.scenePromptOverrides && typeof cs.scenePromptOverrides === "object") {
        setScenePromptOverrides(cs.scenePromptOverrides as Record<string, string>);
      }
      try {
        localStorage.setItem("recreate_last_project_id", row.id);
        window.history.replaceState(null, "", `/recreate?project=${encodeURIComponent(row.id)}`);
      } catch {
        /* ignore */
      }
      toast.success("Project restored.");
    } finally {
      window.setTimeout(() => {
        allowProjectSaveRef.current = true;
      }, 600);
    }
  }, []);

  useEffect(() => {
    void refreshProjectsList();
    void (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get("project")?.trim();
        const stored = localStorage.getItem("recreate_last_project_id")?.trim() ?? "";
        const pick = fromUrl || stored;
        if (pick) await loadProjectById(pick);
      } catch {
        /* ignore */
      }
    })();
  }, [loadProjectById, refreshProjectsList]);

  useEffect(() => {
    if (!projectId || !result || !allowProjectSaveRef.current) return;
    const tid = window.setTimeout(() => {
      void fetch(`/api/recreate/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientState: {
            scriptDraft,
            scriptApproved,
            sceneModelChoice,
            scenePromptOverrides,
          },
        }),
      }).catch(() => {});
    }, 1000);
    return () => window.clearTimeout(tid);
  }, [projectId, result, scriptApproved, scriptDraft, sceneModelChoice, scenePromptOverrides]);

  const fileMeta = useMemo(() => {
    if (!file) return null;
    return `${file.name} (${formatBytes(file.size)})`;
  }, [file]);

  const handleAnalyze = useCallback(async () => {
    if (!file) {
      setError("Select a video file first.");
      return;
    }

    setRunning(true);
    setError(null);
    setLogs([]);
    setResult(null);
    setProjectId(null);
    setProjectKeyframes({});
    setProjectAssets(EMPTY_PROJECT_ASSETS);
    allowProjectSaveRef.current = false;
    setProgress(INITIAL_PROGRESS);

    try {
      assertStudioVideoUpload(file);
      appendLog(`Video accepted: ${file.name} (${formatBytes(file.size)}).`);

      const objectUrl = URL.createObjectURL(file);

      try {
        appendLog("Loading video metadata...");
        const video = await loadVideoForAnalysis(objectUrl);
        const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

        setProgress({
          durationSec,
          sourceUploaded: false,
          detectedScenes: 0,
          analyzedKeyframes: 0,
        });

        appendLog(
          `Video metadata loaded: ${durationSec.toFixed(2)}s, ${video.videoWidth || 0}x${video.videoHeight || 0}.`,
        );
        appendLog(
          `Scene detection mode enabled. ffmpeg will detect cuts first, then Claude will analyze the start and end screenshot of each scene (threshold ${RECREATE_SCENE_THRESHOLD}).`,
        );
        appendLog("Uploading source video...");
        const videoUrl = await uploadFileToCdn(file, { kind: "video" });
        setProgress((prev) => ({ ...prev, sourceUploaded: true }));
        appendLog(`Source video uploaded: ${videoUrl}`);
        appendLog("Starting server-side scene detection and start/end screenshot extraction.");

        const res = await fetch("/api/recreate/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            durationSec,
            frameIntervalSec: 0.1,
            truncated: false,
            videoUrl,
            frames: [],
          }),
        });
        const json = (await res.json().catch(() => ({}))) as Partial<RecreateAnalyzeResponse> & {
          error?: string;
          logs?: string[];
        };

        for (const line of json.logs ?? []) {
          appendLog(`[server] ${line}`);
        }

        if (!res.ok || !json.scenes || !json.frames) {
          const statusHint =
            res.status === 504
              ? "The server timed out while analyzing your video. Try a shorter clip, or retry in a moment — long ads with many scenes can take several minutes."
              : null;
          throw new Error(json.error || statusHint || `Analysis failed (HTTP ${res.status}).`);
        }

        const responseJson: RecreateAnalyzeResponse = {
          ...(json as RecreateAnalyzeResponse),
          creativeBrief: json.creativeBrief ?? null,
        };
        setResult(responseJson);
        setProgress((prev) => ({
          ...prev,
          detectedScenes: responseJson.sceneCount,
          analyzedKeyframes: responseJson.analyzedFrameCount,
        }));
        appendLog(
          `Analysis complete: ${responseJson.sceneCount} scenes from ${responseJson.analyzedFrameCount} screenshots.`,
        );

        allowProjectSaveRef.current = false;
        try {
          const pres = await fetch("/api/recreate/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: file.name,
              videoUrl,
              videoFileName: file.name,
              durationSec,
              analysis: responseJson,
            }),
          });
          const pro = (await pres.json()) as {
            id?: string;
            error?: string;
            keyframes_json?: Record<string, RecreateSceneKeyframes>;
            product_image_url?: string | null;
            packaging_image_url?: string | null;
            logo_image_url?: string | null;
          };
          if (pres.ok && pro.id) {
            setProjectId(pro.id);
            setProjectKeyframes((pro.keyframes_json ?? {}) as Record<string, RecreateSceneKeyframes>);
            setProjectAssets({
              productImageUrl: pro.product_image_url ?? null,
              packagingImageUrl: pro.packaging_image_url ?? null,
              logoImageUrl: pro.logo_image_url ?? null,
            });
            try {
              localStorage.setItem("recreate_last_project_id", pro.id);
              window.history.replaceState(null, "", `/recreate?project=${encodeURIComponent(pro.id)}`);
            } catch {
              /* ignore */
            }
            void refreshProjectsList();
            window.setTimeout(() => {
              allowProjectSaveRef.current = true;
            }, 600);
            appendLog("Saved as an in-production project. You can leave and resume later.");
          } else {
            appendLog(`[server] Project save skipped: ${pro.error ?? pres.status}`);
            toast.error(pro.error ?? "Analysis ran but could not save the project to your account.");
          }
        } catch (e) {
          appendLog(`[server] Project save failed: ${e instanceof Error ? e.message : String(e)}`);
        }

        video.pause();
        video.removeAttribute("src");
        video.load();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not analyze the uploaded video.";
      setError(message);
      appendLog(`Run failed: ${message}`);
    } finally {
      setRunning(false);
    }
  }, [appendLog, file, refreshProjectsList]);

  const downloadBriefPack = useCallback(() => {
    if (!result) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      creativeBrief: result.creativeBrief,
      scriptDraft,
      scriptApproved,
      scenes: result.scenes.map((s) => ({
        ...s,
        selectedVideoModel: sceneModelChoice[s.sceneId] ?? pickValidStudioModelId(s.recommendedVideoModels?.[0]),
        videoGenerationPrompt: scenePromptOverrides[s.sceneId] ?? s.videoGenerationPrompt,
      })),
      productFileName: productFile?.name ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recreate-video-briefs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded scene brief pack (JSON).");
  }, [productFile?.name, result, sceneModelChoice, scenePromptOverrides, scriptApproved, scriptDraft]);

  const copyText = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${label}.`);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }, []);

  const patchProjectFields = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!projectId) return;
      const res = await fetch(`/api/recreate/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed");
    },
    [projectId],
  );

  const uploadProjectAsset = useCallback(
    async (f: File, field: "productImageUrl" | "packagingImageUrl" | "logoImageUrl") => {
      if (!projectId) {
        toast.error("Run video analysis first to create a saved project.");
        return;
      }
      setGlobalUploadBusy(true);
      try {
        const url = await uploadFileToCdn(f, { kind: "image" });
        await patchProjectFields({ [field]: url });
        setProjectAssets((prev) => ({
          ...prev,
          [field === "productImageUrl"
            ? "productImageUrl"
            : field === "packagingImageUrl"
              ? "packagingImageUrl"
              : "logoImageUrl"]: url,
        }));
        toast.success("Reference saved on the project.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setGlobalUploadBusy(false);
      }
    },
    [patchProjectFields, projectId],
  );

  const uploadFrameProduct = useCallback(
    async (sceneId: string, role: "start" | "end", f: File) => {
      if (!projectId) {
        toast.error("Run analysis first so a project exists.");
        return;
      }
      const busyKey = `${sceneId}:${role}`;
      setFrameUploadBusy(busyKey);
      try {
        const url = await uploadFileToCdn(f, { kind: "image" });
        const next = { ...projectKeyframes };
        const prev = next[sceneId] ?? emptySceneKeyframes();
        next[sceneId] =
          role === "start"
            ? { ...prev, start: { ...prev.start, productImageUrl: url } }
            : { ...prev, end: { ...prev.end, productImageUrl: url } };
        await patchProjectFields({ keyframesJson: next });
        setProjectKeyframes(next);
        toast.success(`Product saved for ${sceneId} (${role}).`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setFrameUploadBusy(null);
      }
    },
    [patchProjectFields, projectId, projectKeyframes],
  );

  const applyDefaultProductToAllFrames = useCallback(async () => {
    const url = projectAssets.productImageUrl?.trim() ?? "";
    if (!projectId || !result || !/^https?:\/\//i.test(url)) {
      toast.error("Upload a default product image first.");
      return;
    }
    setGlobalUploadBusy(true);
    try {
      const next = { ...projectKeyframes };
      for (const s of result.scenes) {
        const prev = next[s.sceneId] ?? emptySceneKeyframes();
        next[s.sceneId] = {
          start: { ...prev.start, productImageUrl: url },
          end: { ...prev.end, productImageUrl: url },
        };
      }
      await patchProjectFields({ keyframesJson: next });
      setProjectKeyframes(next);
      toast.success("Default product applied to all frames.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply product.");
    } finally {
      setGlobalUploadBusy(false);
    }
  }, [patchProjectFields, projectAssets.productImageUrl, projectId, projectKeyframes, result]);

  const runSingleKeyframe = useCallback(
    async (sceneId: string, role: "start" | "end", force?: boolean) => {
      if (!projectId) {
        toast.error("Run analysis first so a project exists.");
        return;
      }
      const key = `${sceneId}:${role}`;
      setKeyframeRunning(key);
      try {
        const res = await fetch(`/api/recreate/projects/${encodeURIComponent(projectId)}/keyframes/single`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneId, role, force: force === true }),
        });
        const json = (await res.json()) as {
          error?: string;
          project?: { keyframes_json?: Record<string, RecreateSceneKeyframes> };
          cached?: boolean;
        };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (json.project?.keyframes_json) {
          setProjectKeyframes(json.project.keyframes_json as Record<string, RecreateSceneKeyframes>);
        }
        toast.success(json.cached ? "Keyframe already available." : "Keyframe generated.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Keyframe failed");
      } finally {
        setKeyframeRunning(null);
      }
    },
    [projectId],
  );

  const runAllKeyframes = useCallback(async () => {
    if (!result || !projectId) return;
    for (const s of result.scenes) {
      for (const role of ["start", "end"] as const) {
        await runSingleKeyframe(s.sceneId, role, false);
      }
    }
    toast.success("Queued keyframes finished (skipped ones that were already generated).");
  }, [projectId, result, runSingleKeyframe]);

  return (
    <div className="min-h-screen bg-[#09090b] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/60">
            <Video className="size-3.5" />
            Recreate Analysis
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Analyze a video scene by scene</h1>
          <p className="max-w-3xl text-sm text-white/65">
            Upload a local ad video, detect cuts with ffmpeg first, then analyze the start and end screenshot of each
            scene with <span className="font-medium text-white">Claude</span>. You get rich production cues (UGC vs
            claymation vs Pixar-like CGI), background and on-screen talent notes, recommended Studio video models per
            scene, a draft script, marketing angles, and exportable briefs for each scene clip plus final assembly notes.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card className="border-emerald-400/20 bg-emerald-500/[0.06] text-white shadow-none">
              <CardHeader>
                <CardTitle>Projects in production</CardTitle>
                <CardDescription className="text-white/55">
                  Your analysis, script edits, and GPT Image 2 keyframes stay linked to this project so you can resume
                  after leaving the page.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-white/80">
                {projectId ? (
                  <p className="text-xs text-emerald-100/90">
                    Active project id: <span className="font-mono text-white/90">{projectId}</span>
                  </p>
                ) : (
                  <p className="text-xs text-white/50">Run an analysis to create a project automatically.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                    disabled={projectsLoading}
                    onClick={() => void refreshProjectsList()}
                  >
                    {projectsLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Refresh list
                  </Button>
                  {projectId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                      onClick={() => void copyText("project id", projectId)}
                    >
                      <Copy className="mr-2 size-3.5" />
                      Copy id
                    </Button>
                  ) : null}
                </div>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/25 p-2">
                  {projectsList.length === 0 ? (
                    <div className="px-1 py-2 text-xs text-white/45">No in-progress projects.</div>
                  ) : (
                    projectsList.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => void loadProjectById(p.id)}
                        className={`flex w-full flex-col rounded-md px-2 py-2 text-left text-xs transition hover:bg-white/5 ${
                          projectId === p.id ? "bg-emerald-500/15 text-emerald-50" : "text-white/75"
                        }`}
                      >
                        <span className="font-medium text-white">{p.title}</span>
                        <span className="text-white/40">{p.video_file_name ?? "Video"}</span>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
              <CardHeader>
                <CardTitle>Input</CardTitle>
                <CardDescription className="text-white/55">
                  Local upload only in this first version.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Video file</label>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept={STUDIO_VIDEO_FILE_ACCEPT}
                    className="sr-only"
                    disabled={running}
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={running}
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full border-white/15 bg-white/10 text-white hover:bg-white/15"
                  >
                    <Upload className="mr-2 size-4" />
                    {file ? "Change video" : "Choose video file"}
                  </Button>
                  <p className="text-xs text-white/45">Allowed: MP4, MOV, or WebM.</p>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/75">
                  <div>Model: `claude-sonnet-4-6`</div>
                  <div>Scene detection: ffmpeg content-diff threshold {RECREATE_SCENE_THRESHOLD}</div>
                  <div>Representative input: 2 screenshots per detected scene (start + end)</div>
                  <div>Verbose logs: enabled</div>
                </div>

                {fileMeta ? (
                  <div className="rounded-lg border border-violet-400/20 bg-violet-400/10 p-3 text-sm text-violet-100">
                    {fileMeta}
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
                    {error}
                  </div>
                ) : null}

                <Button
                  type="button"
                  disabled={!file || running}
                  onClick={() => void handleAnalyze()}
                  className="w-full bg-violet-400 text-black hover:bg-violet-300"
                >
                  {running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                  {running ? "Analyzing..." : "Analyze video"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
              <CardHeader>
                <CardTitle>Run Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-white/75">
                <div>Video duration: {progress.durationSec ? progress.durationSec.toFixed(2) : "0.00"}s</div>
                <div>Source video uploaded: {progress.sourceUploaded ? "yes" : "no"}</div>
                <div>Detected scenes: {progress.detectedScenes}</div>
                <div>Analyzed screenshots: {progress.analyzedKeyframes}</div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
          <RecreateResultsPanel
            result={result}
            projectId={projectId}
            projectAssets={projectAssets}
            projectKeyframes={projectKeyframes}
            keyframeRunning={keyframeRunning}
            frameUploadBusy={frameUploadBusy}
            globalUploadBusy={globalUploadBusy}
            scriptDraft={scriptDraft}
            scriptApproved={scriptApproved}
            sceneModelChoice={sceneModelChoice}
            scenePromptOverrides={scenePromptOverrides}
            logs={logs}
            pickValidStudioModelId={pickValidStudioModelId}
            formatSeconds={formatSeconds}
            onScriptDraftChange={(value) => {
              setScriptDraft(value);
              setScriptApproved(false);
            }}
            onScriptApprove={() => {
              setScriptApproved(true);
              toast.success("Script marked approved for this session.");
            }}
            onSceneModelChange={(sceneId, modelId) =>
              setSceneModelChoice((prev) => ({ ...prev, [sceneId]: modelId }))
            }
            onScenePromptChange={(sceneId, prompt) =>
              setScenePromptOverrides((prev) => ({ ...prev, [sceneId]: prompt }))
            }
            onUploadProjectAsset={(file, field) => void uploadProjectAsset(file, field)}
            onUploadFrameProduct={(sceneId, role, file) => void uploadFrameProduct(sceneId, role, file)}
            onApplyDefaultProductToAllFrames={() => void applyDefaultProductToAllFrames()}
            onGenerateKeyframe={(sceneId, role, force) => void runSingleKeyframe(sceneId, role, force)}
            onGenerateAllKeyframes={() => void runAllKeyframes()}
            onCopyText={(label, text) => void copyText(label, text)}
            onDownloadBriefPack={() => downloadBriefPack()}
          />
          </div>
        </div>
      </div>
    </div>
  );
}
