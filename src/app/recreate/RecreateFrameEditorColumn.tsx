"use client";

import { useRef } from "react";
import { Check, Loader2, Package, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type RecreateScene } from "@/lib/recreateAnalysis";
import {
  resolveFrameProductUrl,
  type RecreateProjectAssets,
  type RecreateSceneKeyframes,
} from "@/lib/recreateProjects";
import { cn } from "@/lib/utils";

import { FramePreviewThumb } from "./RecreateFramePreviewThumb";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

export function RecreateFrameEditorColumn(props: {
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

  const busyKey = `${scene.sceneId}:${role}`;
  const uploadBusy = frameUploadBusy === busyKey;
  const genBusy = keyframeRunning === busyKey;
  const productUrl = resolveFrameProductUrl(slot, projectAssets.productImageUrl);
  const beat = role === "start" ? scene.startDescription : scene.endDescription;
  const hasReference = Boolean(referenceUrl?.trim());
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-black/25">
      <div className="border-b border-white/10 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
          {role} frame
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Reference ad</p>
        <div className="relative flex h-[84px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black">
          <FramePreviewThumb
            url={referenceUrl}
            alt=""
            className="max-h-full max-w-full"
            fit="contain"
            placeholder={
              role === "end" ? (
                <div className="h-full w-full bg-[repeating-conic-gradient(#333_0%_25%,#222_0%_50%)] bg-[length:12px_12px] opacity-60" />
              ) : undefined
            }
          />
        </div>

        <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Your product</p>
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
        <button
          type="button"
          disabled={!projectId || uploadBusy}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex h-[60px] shrink-0 items-center gap-2 rounded-lg border px-2 text-left transition",
            productUrl
              ? "border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/15"
              : "border-dashed border-white/20 bg-black/30 hover:border-white/35",
          )}
        >
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/50">
            {productUrl ? (
              <FramePreviewThumb url={productUrl} alt="" className="max-h-full max-w-full" fit="contain" />
            ) : (
              <Package className="size-4 text-white/35" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-white">
              {uploadBusy ? "Uploading…" : productUrl ? "Product set" : "Tap to set product"}
            </p>
            <p className="text-[10px] text-white/45">For this frame</p>
          </div>
          {productUrl ? <Check className="size-4 shrink-0 text-emerald-400" /> : null}
        </button>

        <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Generated</p>
        <div className="relative flex h-[84px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-violet-400/25 bg-black">
          <FramePreviewThumb
            url={slot.outputUrl}
            alt=""
            className="max-h-full max-w-full"
            fit="contain"
            placeholder={<span className="text-[10px] text-white/30">Not generated yet</span>}
          />
        </div>

        <p className="line-clamp-2 shrink-0 text-[10px] leading-snug text-white/55">{beat ?? "—"}</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!projectId || !hasReference || !productUrl || uploadBusy || genBusy}
          onClick={() => onGenerateKeyframe(scene.sceneId, role, Boolean(slot.outputUrl))}
          className="h-8 w-full shrink-0 border-white/15 bg-white/10 text-xs text-white hover:bg-white/15"
        >
          {genBusy ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 size-3.5" />
          )}
          Regenerate frame
        </Button>
      </div>
    </div>
  );
}
