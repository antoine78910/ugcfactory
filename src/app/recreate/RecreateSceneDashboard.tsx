"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  LayoutGrid,
  Loader2,
  ScrollText,
  Sparkles,
  Terminal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { RECREATE_SCENE_THRESHOLD } from "@/lib/recreateSceneDetection";
import { cn } from "@/lib/utils";

import { RecreateFilePick } from "./RecreateFilePick";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

type DashboardTab = "scenes" | "brief" | "logs";

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
  sceneModelChoice: Record<string, string>;
  scenePromptOverrides: Record<string, string>;
  logs: ClientLogEntry[];
  pickValidStudioModelId: (raw: string | undefined) => string;
  formatSeconds: (value: number) => string;
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
  onGenerateAllKeyframes: () => void;
  onCopyText: (label: string, text: string) => void;
  onDownloadBriefPack: () => void;
};

function frameKey(sceneId: string, role: "start" | "end") {
  return `${sceneId}:${role}`;
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-white/45">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function FrameColumn(props: {
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
  const hasReference = Boolean(referenceUrl?.trim());

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
          {role} frame
        </span>
        {productUrl ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
            Product ready
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
            Product needed
          </span>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-white/40">Reference (from video)</p>
        {hasReference ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={referenceUrl}
            alt=""
            className="aspect-video w-full rounded-lg border border-white/10 object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-amber-400/30 bg-amber-500/5 text-center text-[10px] text-amber-200/80">
            Re-run analysis with server storage configured
          </div>
        )}
        {beat ? <p className="line-clamp-3 text-[11px] leading-snug text-white/55">{beat}</p> : null}
      </div>

      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-white/40">Your product photo</p>
        <RecreateFilePick
          accept={IMAGE_ACCEPT}
          label={productUrl ? "Replace product" : "Upload product"}
          variant="compact"
          disabled={!projectId}
          busy={uploadBusy}
          previewUrl={productUrl || null}
          onPick={(file) => onUploadFrameProduct(scene.sceneId, role, file)}
        />
      </div>

      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-white/40">Generated (GPT Image 2)</p>
        {slot.outputUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slot.outputUrl}
            alt=""
            className="aspect-video w-full rounded-lg border border-violet-400/25 object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/30 text-[10px] text-white/35">
            Not generated yet
          </div>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!projectId || !hasReference || !productUrl || uploadBusy || genBusy}
          onClick={() => onGenerateKeyframe(scene.sceneId, role, Boolean(slot.outputUrl))}
          className="w-full border-white/15 bg-violet-500/20 text-violet-50 hover:bg-violet-500/30"
        >
          {genBusy ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Sparkles className="mr-2 size-3.5" />}
          {genBusy ? "Generating…" : slot.outputUrl ? "Regenerate" : "Generate"}
        </Button>
      </div>
    </div>
  );
}

function SceneCard(props: {
  scene: RecreateScene;
  expanded: boolean;
  onToggle: () => void;
  projectId: string | null;
  projectAssets: RecreateProjectAssets;
  projectKeyframes: Record<string, RecreateSceneKeyframes>;
  frameUploadBusy: string | null;
  keyframeRunning: string | null;
  sceneModelChoice: Record<string, string>;
  scenePromptOverrides: Record<string, string>;
  pickValidStudioModelId: (raw: string | undefined) => string;
  formatSeconds: (value: number) => string;
  onSceneModelChange: (sceneId: string, modelId: string) => void;
  onScenePromptChange: (sceneId: string, prompt: string) => void;
  onUploadFrameProduct: (sceneId: string, role: "start" | "end", file: File) => void;
  onGenerateKeyframe: (sceneId: string, role: "start" | "end", force: boolean) => void;
}) {
  const slots = props.projectKeyframes[props.scene.sceneId] ?? emptySceneKeyframes();

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={props.onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
      >
        {props.expanded ? (
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-white/50" />
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-white/50" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{props.scene.sceneId}</span>
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
              {props.formatSeconds(props.scene.startSec)} → {props.formatSeconds(props.scene.endSec)}
            </span>
            <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-200">
              {props.scene.visualStyleCategory ?? "unknown"}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-white/70">{props.scene.shortDescription}</p>
        </div>
      </button>

      {props.expanded ? (
        <div className="space-y-4 border-t border-white/10 px-4 pb-4 pt-3">
          <p className="text-sm text-white/65">{props.scene.summary}</p>

          <div className="grid gap-3 lg:grid-cols-2">
            <FrameColumn
              scene={props.scene}
              role="start"
              referenceUrl={props.scene.sceneStartImageUrl}
              slot={slots.start}
              projectAssets={props.projectAssets}
              projectId={props.projectId}
              frameUploadBusy={props.frameUploadBusy}
              keyframeRunning={props.keyframeRunning}
              onUploadFrameProduct={props.onUploadFrameProduct}
              onGenerateKeyframe={props.onGenerateKeyframe}
            />
            <FrameColumn
              scene={props.scene}
              role="end"
              referenceUrl={props.scene.sceneEndImageUrl}
              slot={slots.end}
              projectAssets={props.projectAssets}
              projectId={props.projectId}
              frameUploadBusy={props.frameUploadBusy}
              keyframeRunning={props.keyframeRunning}
              onUploadFrameProduct={props.onUploadFrameProduct}
              onGenerateKeyframe={props.onGenerateKeyframe}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-white/70">
              <span className="text-white/45">Background · </span>
              {props.scene.backgroundDescription ?? "—"}
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-white/70">
              <span className="text-white/45">Talent · </span>
              {props.scene.onScreenTalentDescription ?? "—"}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-white/70">Video generation prompt</Label>
            <Textarea
              value={props.scenePromptOverrides[props.scene.sceneId] ?? ""}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                props.onScenePromptChange(props.scene.sceneId, e.target.value)
              }
              rows={4}
              className="border-white/10 bg-black/40 text-xs leading-relaxed text-white"
            />
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1 space-y-1">
                <Label className="text-xs text-white/70">Studio video model</Label>
                <select
                  className="h-9 w-full rounded-md border border-white/10 bg-black/50 px-2 text-xs text-white"
                  value={
                    props.sceneModelChoice[props.scene.sceneId] ??
                    props.pickValidStudioModelId(props.scene.recommendedVideoModels?.[0])
                  }
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    props.onSceneModelChange(props.scene.sceneId, e.target.value)
                  }
                >
                  {STUDIO_VIDEO_PICKER_IDS.map((id) => (
                    <option key={id} value={id} className="bg-zinc-900 text-white">
                      {id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RecreateSceneDashboard(props: RecreateSceneDashboardProps) {
  const [tab, setTab] = useState<DashboardTab>("scenes");
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedScenes(new Set(props.result.scenes.map((s) => s.sceneId)));
  }, [props.result.scenes]);

  const stats = useMemo(() => {
    let ready = 0;
    let withProduct = 0;
    const totalFrames = props.result.scenes.length * 2;
    for (const s of props.result.scenes) {
      const slots = props.projectKeyframes[s.sceneId] ?? emptySceneKeyframes();
      for (const role of ["start", "end"] as const) {
        const slot = slots[role];
        if (slot.outputUrl) ready += 1;
        if (resolveFrameProductUrl(slot, props.projectAssets.productImageUrl)) withProduct += 1;
      }
    }
    return { ready, withProduct, totalFrames };
  }, [props.projectAssets.productImageUrl, props.projectKeyframes, props.result.scenes]);

  const tabs: { id: DashboardTab; label: string; icon: React.ReactElement }[] = [
    { id: "scenes", label: "Scene board", icon: <LayoutGrid className="size-3.5" /> },
    { id: "brief", label: "Creative brief", icon: <ScrollText className="size-3.5" /> },
    { id: "logs", label: "Logs", icon: <Terminal className="size-3.5" /> },
  ];

  function toggleScene(sceneId: string) {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  }

  function expandAll() {
    setExpandedScenes(new Set(props.result.scenes.map((s) => s.sceneId)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
              tab === t.id
                ? "bg-violet-500/20 text-violet-100"
                : "text-white/55 hover:bg-white/5 hover:text-white",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "scenes" ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatPill label="Scenes" value={props.result.sceneCount} />
            <StatPill label="Frames ready" value={`${stats.ready}/${stats.totalFrames}`} />
            <StatPill label="Products set" value={`${stats.withProduct}/${stats.totalFrames}`} />
            <StatPill label="Detection" value={RECREATE_SCENE_THRESHOLD} />
          </div>

          <Card className="border-violet-400/20 bg-violet-500/[0.06] text-white shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Default brand assets</CardTitle>
              <CardDescription className="text-white/55">
                Set a default product for every frame, or upload a different product on each start/end frame below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <RecreateFilePick
                  accept={IMAGE_ACCEPT}
                  label="Default product"
                  hint="Used when a frame has no specific product."
                  disabled={!props.projectId}
                  busy={props.globalUploadBusy}
                  previewUrl={props.projectAssets.productImageUrl}
                  onPick={(file) => void props.onUploadProjectAsset(file, "productImageUrl")}
                />
                <RecreateFilePick
                  accept={IMAGE_ACCEPT}
                  label="Packaging (optional)"
                  disabled={!props.projectId}
                  busy={props.globalUploadBusy}
                  previewUrl={props.projectAssets.packagingImageUrl}
                  onPick={(file) => void props.onUploadProjectAsset(file, "packagingImageUrl")}
                />
                <RecreateFilePick
                  accept={IMAGE_ACCEPT}
                  label="Logo (optional)"
                  disabled={!props.projectId}
                  busy={props.globalUploadBusy}
                  previewUrl={props.projectAssets.logoImageUrl}
                  onPick={(file) => void props.onUploadProjectAsset(file, "logoImageUrl")}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                  disabled={!props.projectId || !props.projectAssets.productImageUrl}
                  onClick={() => props.onApplyDefaultProductToAllFrames()}
                >
                  Apply default product to all frames
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="border border-violet-300/30 bg-violet-500/20 text-violet-50 hover:bg-violet-500/30"
                  disabled={
                    !props.projectId || Boolean(props.keyframeRunning) || stats.withProduct < stats.totalFrames
                  }
                  onClick={() => void props.onGenerateAllKeyframes()}
                >
                  <Sparkles className="mr-2 size-3.5" />
                  Generate all frames
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                  onClick={expandAll}
                >
                  Expand all scenes
                </Button>
              </div>
              {stats.withProduct < stats.totalFrames ? (
                <p className="text-xs text-amber-200/85">
                  Upload a product on each frame (or set a default and apply to all) before generating.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-3">
            {props.result.scenes.map((scene) => (
              <SceneCard
                key={scene.sceneId}
                scene={scene}
                expanded={expandedScenes.has(scene.sceneId)}
                onToggle={() => toggleScene(scene.sceneId)}
                projectId={props.projectId}
                projectAssets={props.projectAssets}
                projectKeyframes={props.projectKeyframes}
                frameUploadBusy={props.frameUploadBusy}
                keyframeRunning={props.keyframeRunning}
                sceneModelChoice={props.sceneModelChoice}
                scenePromptOverrides={props.scenePromptOverrides}
                pickValidStudioModelId={props.pickValidStudioModelId}
                formatSeconds={props.formatSeconds}
                onSceneModelChange={props.onSceneModelChange}
                onScenePromptChange={props.onScenePromptChange}
                onUploadFrameProduct={props.onUploadFrameProduct}
                onGenerateKeyframe={props.onGenerateKeyframe}
              />
            ))}
          </div>

          <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Video summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-white/75">
              <p>{props.result.segmentationSummary}</p>
              <p className="text-white/60">{props.result.videoSummary}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "brief" ? (
        <div className="space-y-4">
          {props.result.creativeBrief ? (
            <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
              <CardHeader>
                <CardTitle>Global creative brief</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-white/80">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="text-xs uppercase text-white/45">Visual lane</div>
                  <div className="font-medium text-white">
                    {props.result.creativeBrief.globalVisualStyleCategory}
                  </div>
                  <p className="mt-1 text-white/70">{props.result.creativeBrief.globalVisualStyleRationale}</p>
                </div>
                <div className="rounded-lg border border-violet-400/20 bg-violet-500/10 p-3">
                  <div className="text-xs uppercase text-violet-200/90">Primary angle</div>
                  <div className="font-medium text-white">
                    {props.result.creativeBrief.primaryMarketingAngleLabel}
                  </div>
                  <p className="mt-1">{props.result.creativeBrief.primaryMarketingAngleRationale}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Script draft</Label>
                  <Textarea
                    value={props.scriptDraft}
                    onChange={(e) => props.onScriptDraftChange(e.target.value)}
                    rows={14}
                    className="border-white/10 bg-black/40 font-mono text-xs text-white"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      className="bg-emerald-500/90 text-black hover:bg-emerald-400"
                      onClick={props.onScriptApprove}
                    >
                      <Check className="mr-2 size-4" />
                      Approve script
                    </Button>
                    {props.scriptApproved ? (
                      <span className="text-xs font-medium text-emerald-300">Approved</span>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      className="border-white/15 bg-white/10 text-white"
                      onClick={() => void props.onCopyText("script", props.scriptDraft)}
                    >
                      <Copy className="mr-2 size-4" />
                      Copy
                    </Button>
                    <Button
                      type="button"
                      className="bg-violet-400 text-black hover:bg-violet-300"
                      onClick={props.onDownloadBriefPack}
                    >
                      <Download className="mr-2 size-4" />
                      Export JSON pack
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-white/50">No creative brief returned.</p>
          )}
        </div>
      ) : null}

      {tab === "logs" ? (
        <Card className="border-white/10 bg-white/[0.03] text-white shadow-none">
          <CardContent className="pt-6">
            <div className="max-h-[560px] overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs leading-6 text-white/80">
              {props.logs.length === 0 ? (
                <div className="text-white/40">No logs yet.</div>
              ) : (
                props.logs.map((entry) => <div key={entry.id}>{entry.message}</div>)
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
