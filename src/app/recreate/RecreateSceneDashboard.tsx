"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Clapperboard,
  Copy,
  Download,
  ImageIcon,
  Loader2,
  Package,
  RefreshCw,
  ScrollText,
  Sparkles,
  Terminal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type RecreateAnalyzeResponse, type RecreateScene } from "@/lib/recreateAnalysis";
import {
  emptySceneKeyframes,
  resolveFrameProductUrl,
  type RecreateProjectAssets,
  type RecreateSceneKeyframes,
} from "@/lib/recreateProjects";
import { STUDIO_VIDEO_PICKER_IDS } from "@/lib/studioVideoModelCapabilities";
import { cn } from "@/lib/utils";

import { RecreateFilePick } from "./RecreateFilePick";
import {
  formatRecreateVideoModelLabel,
  pickValidRecreateImageModelId,
  RECREATE_IMAGE_MODEL_OPTIONS,
} from "./recreateModelPickers";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

type ClientLogEntry = { id: string; message: string };

type RecreateSceneDashboardProps = {
  result: RecreateAnalyzeResponse;
  projectId: string | null;
  projectAssets: RecreateProjectAssets;
  projectKeyframes: Record<string, RecreateSceneKeyframes>;
  keyframeRunning: string | null;
  frameUploadBusy: string | null;
  globalUploadBusy: boolean;
  scriptDraft: string;
  scriptApproved: boolean;
  imageModelChoice: string;
  sceneModelChoice: Record<string, string>;
  scenePromptOverrides: Record<string, string>;
  logs: ClientLogEntry[];
  pickValidStudioModelId: (raw: string | undefined) => string;
  formatSeconds: (value: number) => string;
  onImageModelChange: (modelId: string) => void;
  onScriptDraftChange: (value: string) => void;
  onScriptApprove: () => void;
  onSceneModelChange: (sceneId: string, modelId: string) => void;
  onScenePromptChange: (sceneId: string, prompt: string) => void;
  onUploadProjectAsset: (
    file: File,
    field: "productImageUrl" | "packagingImageUrl" | "logoImageUrl",
  ) => void;
  onUploadFrameProduct: (sceneId: string, role: "start" | "end", file: File) => void;
  onApplyDefaultProductToAllFrames: () => void;
  onGenerateKeyframe: (sceneId: string, role: "start" | "end", force: boolean) => void;
  onGenerateScene: (sceneId: string, force: boolean) => void;
  onGenerateAllKeyframes: () => void;
  onCopyText: (label: string, text: string) => void;
  onDownloadBriefPack: () => void;
};

function frameKey(sceneId: string, role: "start" | "end") {
  return `${sceneId}:${role}`;
}

function sceneIndexFromId(sceneId: string): number {
  const m = /^scene[-_]?(\d+)$/i.exec(sceneId.trim());
  if (m) return Number.parseInt(m[1] ?? "1", 10);
  const tail = sceneId.replace(/\D/g, "");
  return tail ? Number.parseInt(tail, 10) : 1;
}

function FramePreviewThumb({
  url,
  alt,
  className,
  placeholder,
}: {
  url?: string;
  alt: string;
  className?: string;
  placeholder?: ReactNode;
}) {
  if (url?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt} className={cn("object-cover", className)} />
    );
  }
  return (
    <div className={cn("flex items-center justify-center bg-black/40 text-white/30", className)}>
      {placeholder ?? <Clapperboard className="size-8 opacity-40" />}
    </div>
  );
}

function HoverScenePreview({
  scene,
  anchorRect,
  formatSeconds,
}: {
  scene: RecreateScene;
  anchorRect: DOMRect;
  formatSeconds: (value: number) => string;
}) {
  const pad = 12;
  const width = 320;
  const left = Math.min(
    Math.max(pad, anchorRect.left + anchorRect.width / 2 - width / 2),
    window.innerWidth - width - pad,
  );
  const top = anchorRect.bottom + 8;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] overflow-hidden rounded-xl border border-white/15 bg-[#141416] shadow-2xl shadow-black/60"
      style={{ left, top, width }}
      role="tooltip"
    >
      <div className="grid grid-cols-2 gap-px bg-white/10">
        <div className="space-y-1 bg-[#141416] p-2">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-white/45">Start</p>
          <FramePreviewThumb
            url={scene.sceneStartImageUrl}
            alt=""
            className="aspect-video w-full rounded-md border border-white/10"
          />
        </div>
        <div className="space-y-1 bg-[#141416] p-2">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-white/45">End</p>
          <FramePreviewThumb
            url={scene.sceneEndImageUrl}
            alt=""
            className="aspect-video w-full rounded-md border border-white/10"
          />
        </div>
      </div>
      <div className="border-t border-white/10 px-3 py-2">
        <p className="line-clamp-2 text-xs text-white/80">{scene.shortDescription}</p>
        <p className="mt-0.5 text-[10px] text-white/45">
          {formatSeconds(scene.startSec)} → {formatSeconds(scene.endSec)}
        </p>
      </div>
    </div>,
    document.body,
  );
}

function SceneTimelineCard(props: {
  scene: RecreateScene;
  index: number;
  selected: boolean;
  videoModelId: string;
  formatSeconds: (value: number) => string;
  onSelect: () => void;
  onHover: (rect: DOMRect | null) => void;
}) {
  const { scene, index, selected, videoModelId, formatSeconds, onSelect, onHover } = props;
  const thumb = scene.sceneStartImageUrl ?? scene.sceneEndImageUrl;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={(e) => onHover(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => onHover(null)}
      onFocus={(e) => onHover(e.currentTarget.getBoundingClientRect())}
      onBlur={() => onHover(null)}
      className={cn(
        "group relative flex w-[148px] shrink-0 flex-col overflow-hidden rounded-xl border text-left transition",
        selected
          ? "border-violet-400/50 bg-violet-500/[0.08] ring-1 ring-violet-400/30"
          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
      )}
    >
      <span className="absolute left-2 top-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {index}
      </span>
      <div className="relative aspect-[4/3] w-full bg-black/30">
        <FramePreviewThumb url={thumb} alt="" className="h-full w-full" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="text-[10px] text-white/50">
          {formatSeconds(scene.startSec)} → {formatSeconds(scene.endSec)}
        </p>
        <p className="line-clamp-2 min-h-[2rem] text-[11px] leading-snug text-white/85">
          {scene.shortDescription}
        </p>
        <span className="mt-auto inline-flex w-fit rounded-md bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-medium text-sky-200">
          {formatRecreateVideoModelLabel(videoModelId)}
        </span>
      </div>
    </button>
  );
}

function FrameEditorColumn(props: {
  scene: RecreateScene;
  role: "start" | "end";
  referenceUrl: string | undefined;
  slot: RecreateSceneKeyframes["start"];
  projectAssets: RecreateProjectAssets;
  projectId: string | null;
  frameUploadBusy: string | null;
  keyframeRunning: string | null;
  onUploadFrameProduct: (sceneId: string, role: "start" | "end", file: File) => void;
  onGenerateKeyframe: (sceneId: string, role: "start" | "end", force: boolean) => void;
}) {
  const {
    scene,
    role,
    referenceUrl,
    slot,
    projectAssets,
    projectId,
    frameUploadBusy,
    keyframeRunning,
    onUploadFrameProduct,
    onGenerateKeyframe,
  } = props;

  const busyKey = frameKey(scene.sceneId, role);
  const uploadBusy = frameUploadBusy === busyKey;
  const genBusy = keyframeRunning === busyKey;
  const productUrl = resolveFrameProductUrl(slot, projectAssets.productImageUrl);
  const beat = role === "start" ? scene.startDescription : scene.endDescription;
  const displayUrl = slot.outputUrl ?? referenceUrl;
  const hasReference = Boolean(referenceUrl?.trim());
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-black/25">
      <div className="border-b border-white/10 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
          {role} frame
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
          <FramePreviewThumb
            url={displayUrl}
            alt=""
            className="h-full w-full"
            placeholder={
              role === "end" ? (
                <div className="h-full w-full bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:12px_12px] opacity-60" />
              ) : undefined
            }
          />
        </div>
        <p className="line-clamp-3 min-h-[2.75rem] flex-1 text-[11px] leading-snug text-white/60">
          {beat ?? "—"}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            disabled={!projectId || uploadBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUploadFrameProduct(scene.sceneId, role, f);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!projectId || uploadBusy}
            onClick={() => fileInputRef.current?.click()}
            className="h-8 min-w-0 flex-1 border-white/15 bg-white/10 text-xs text-white hover:bg-white/15"
          >
            {uploadBusy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : productUrl ? (
              <Check className="mr-1.5 size-3.5 text-emerald-400" />
            ) : (
              <Package className="mr-1.5 size-3.5" />
            )}
            {productUrl ? "Product set" : "Set product"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!projectId || !hasReference || !productUrl || uploadBusy || genBusy}
            onClick={() => onGenerateKeyframe(scene.sceneId, role, Boolean(slot.outputUrl))}
            className="h-8 shrink-0 border-white/15 bg-white/10 px-3 text-xs text-white hover:bg-white/15"
          >
            {genBusy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 size-3.5" />
            )}
            Regenerate
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RecreateSceneDashboard(props: RecreateSceneDashboardProps) {
  const scenes = props.result.scenes;
  const [selectedSceneId, setSelectedSceneId] = useState<string>(() => scenes[0]?.sceneId ?? "");
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [hoverSceneId, setHoverSceneId] = useState<string | null>(null);
  const [auxPanel, setAuxPanel] = useState<"brief" | "logs" | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scenes.some((s) => s.sceneId === selectedSceneId)) {
      setSelectedSceneId(scenes[0]?.sceneId ?? "");
    }
  }, [scenes, selectedSceneId]);

  const selectedScene = useMemo(
    () => scenes.find((s) => s.sceneId === selectedSceneId) ?? scenes[0],
    [scenes, selectedSceneId],
  );

  const hoverScene = useMemo(
    () => (hoverSceneId ? scenes.find((s) => s.sceneId === hoverSceneId) : null),
    [hoverSceneId, scenes],
  );

  const sceneRegenBusy = useMemo(() => {
    if (!selectedScene || !props.keyframeRunning) return false;
    return (
      props.keyframeRunning === frameKey(selectedScene.sceneId, "start") ||
      props.keyframeRunning === frameKey(selectedScene.sceneId, "end")
    );
  }, [props.keyframeRunning, selectedScene]);

  const handleTimelineHover = useCallback((sceneId: string, rect: DOMRect | null) => {
    setHoverSceneId(rect ? sceneId : null);
    setHoverRect(rect);
  }, []);

  if (!selectedScene) return null;

  const slots = props.projectKeyframes[selectedScene.sceneId] ?? emptySceneKeyframes();
  const videoModel =
    props.sceneModelChoice[selectedScene.sceneId] ??
    props.pickValidStudioModelId(selectedScene.recommendedVideoModels?.[0]);
  const sceneNum = sceneIndexFromId(selectedScene.sceneId);
  const imageModel = pickValidRecreateImageModelId(props.imageModelChoice);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0e]">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <RecreateFilePick
            accept={IMAGE_ACCEPT}
            label="Default product"
            variant="compact"
            disabled={!props.projectId}
            busy={props.globalUploadBusy}
            previewUrl={props.projectAssets.productImageUrl}
            onPick={(file) => void props.onUploadProjectAsset(file, "productImageUrl")}
            className="w-auto max-w-[140px] space-y-1"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 border-white/15 bg-white/10 text-xs text-white"
            disabled={!props.projectId || !props.projectAssets.productImageUrl}
            onClick={() => props.onApplyDefaultProductToAllFrames()}
          >
            <Package className="mr-1.5 size-3.5" />
            Apply to all
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <ImageIcon className="size-3.5 text-white/45" />
            <Label className="sr-only">Image model</Label>
            <select
              className="h-8 max-w-[160px] rounded-md border border-white/10 bg-black/50 px-2 text-xs text-white"
              value={imageModel}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                props.onImageModelChange(e.target.value)
              }
            >
              {RECREATE_IMAGE_MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id} className="bg-zinc-900">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={cn(
              "h-8 border-white/15 text-xs",
              auxPanel === "brief" ? "bg-violet-500/25 text-violet-100" : "bg-white/10 text-white",
            )}
            onClick={() => setAuxPanel((p) => (p === "brief" ? null : "brief"))}
          >
            <ScrollText className="mr-1.5 size-3.5" />
            Brief
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={cn(
              "h-8 border-white/15 text-xs",
              auxPanel === "logs" ? "bg-violet-500/25 text-violet-100" : "bg-white/10 text-white",
            )}
            onClick={() => setAuxPanel((p) => (p === "logs" ? null : "logs"))}
          >
            <Terminal className="mr-1.5 size-3.5" />
            Logs
          </Button>
        </div>
      </div>

      {/* Scene timeline */}
      <div ref={timelineRef} className="shrink-0 border-b border-white/10 px-3 py-3">
        <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
          {scenes.map((scene, i) => (
            <SceneTimelineCard
              key={scene.sceneId}
              scene={scene}
              index={i + 1}
              selected={scene.sceneId === selectedSceneId}
              videoModelId={
                props.sceneModelChoice[scene.sceneId] ??
                props.pickValidStudioModelId(scene.recommendedVideoModels?.[0])
              }
              formatSeconds={props.formatSeconds}
              onSelect={() => setSelectedSceneId(scene.sceneId)}
              onHover={(rect) => handleTimelineHover(scene.sceneId, rect)}
            />
          ))}
        </div>
      </div>

      {hoverScene && hoverRect ? (
        <HoverScenePreview scene={hoverScene} anchorRect={hoverRect} formatSeconds={props.formatSeconds} />
      ) : null}

      {/* Scene editor */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <span className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-sm font-semibold text-white">
            Scene {sceneNum}
          </span>
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">
            {selectedScene.shortDescription}
          </h2>
          <span className="shrink-0 text-xs text-white/50">
            {props.formatSeconds(selectedScene.startSec)} → {props.formatSeconds(selectedScene.endSec)}
          </span>
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-white/45">Video model</Label>
            <select
              className="h-8 max-w-[180px] rounded-md border border-white/10 bg-black/50 px-2 text-xs text-white"
              value={videoModel}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                props.onSceneModelChange(selectedScene.sceneId, e.target.value)
              }
            >
              {STUDIO_VIDEO_PICKER_IDS.map((id) => (
                <option key={id} value={id} className="bg-zinc-900">
                  {formatRecreateVideoModelLabel(id)}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 border border-violet-300/30 bg-violet-500/25 text-xs text-violet-50 hover:bg-violet-500/35"
            disabled={!props.projectId || sceneRegenBusy}
            onClick={() => props.onGenerateScene(selectedScene.sceneId, true)}
          >
            {sceneRegenBusy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 size-3.5" />
            )}
            Regenerate scene
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 md:grid-cols-2">
          <FrameEditorColumn
            scene={selectedScene}
            role="start"
            referenceUrl={selectedScene.sceneStartImageUrl}
            slot={slots.start}
            projectAssets={props.projectAssets}
            projectId={props.projectId}
            frameUploadBusy={props.frameUploadBusy}
            keyframeRunning={props.keyframeRunning}
            onUploadFrameProduct={props.onUploadFrameProduct}
            onGenerateKeyframe={props.onGenerateKeyframe}
          />
          <FrameEditorColumn
            scene={selectedScene}
            role="end"
            referenceUrl={selectedScene.sceneEndImageUrl}
            slot={slots.end}
            projectAssets={props.projectAssets}
            projectId={props.projectId}
            frameUploadBusy={props.frameUploadBusy}
            keyframeRunning={props.keyframeRunning}
            onUploadFrameProduct={props.onUploadFrameProduct}
            onGenerateKeyframe={props.onGenerateKeyframe}
          />
        </div>

        <div className="grid shrink-0 grid-cols-1 gap-2 border-t border-white/10 px-4 py-2.5 md:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Background</p>
            <p className="line-clamp-2 text-xs leading-snug text-white/70">
              {selectedScene.backgroundDescription ?? "—"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
              On-screen talent
            </p>
            <p className="line-clamp-2 text-xs leading-snug text-white/70">
              {selectedScene.onScreenTalentDescription ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Brief / logs overlay — keeps main board scroll-free */}
      {auxPanel ? (
        <div className="absolute inset-x-4 bottom-4 z-20 flex max-h-[42%] flex-col overflow-hidden rounded-xl border border-white/15 bg-[#121214] shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-sm font-medium text-white">
              {auxPanel === "brief" ? "Creative brief" : "Run logs"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-white/60"
              onClick={() => setAuxPanel(null)}
            >
              Close
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {auxPanel === "logs" ? (
              <div className="font-mono text-xs leading-6 text-white/75">
                {props.logs.length === 0 ? (
                  <div className="text-white/40">No logs yet.</div>
                ) : (
                  props.logs.map((entry) => <div key={entry.id}>{entry.message}</div>)
                )}
              </div>
            ) : (
              <div className="space-y-3 text-sm text-white/80">
                {props.result.creativeBrief ? (
                  <>
                    <p className="text-xs text-white/55">
                      {props.result.creativeBrief.globalVisualStyleRationale}
                    </p>
                    <Label className="text-xs text-white/70">Script draft</Label>
                    <Textarea
                      value={props.scriptDraft}
                      onChange={(e) => props.onScriptDraftChange(e.target.value)}
                      rows={6}
                      className="border-white/10 bg-black/40 font-mono text-xs text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="bg-emerald-500/90 text-black hover:bg-emerald-400"
                        onClick={props.onScriptApprove}
                      >
                        <Check className="mr-1.5 size-3.5" />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="border-white/15 bg-white/10 text-white"
                        onClick={() => void props.onCopyText("script", props.scriptDraft)}
                      >
                        <Copy className="mr-1.5 size-3.5" />
                        Copy
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-violet-400 text-black"
                        onClick={props.onDownloadBriefPack}
                      >
                        <Download className="mr-1.5 size-3.5" />
                        Export JSON
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-white/50">No creative brief.</p>
                )}
                <div className="space-y-1">
                  <Label className="text-xs text-white/70">Video prompt (this scene)</Label>
                  <Textarea
                    value={props.scenePromptOverrides[selectedScene.sceneId] ?? ""}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                      props.onScenePromptChange(selectedScene.sceneId, e.target.value)
                    }
                    rows={4}
                    className="border-white/10 bg-black/40 text-xs text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
