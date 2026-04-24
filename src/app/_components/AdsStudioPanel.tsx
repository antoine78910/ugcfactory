"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Smartphone, Package2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreditsPlan, getPersonalApiKey, getPersonalPiapiApiKey } from "@/app/_components/CreditsPlanContext";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { STUDIO_IMAGE_FILE_ACCEPT } from "@/lib/studioUploadValidation";
import { cn } from "@/lib/utils";

type AdsStudioHistoryItem = {
  id: string;
  createdAt: number;
  assetType: "product" | "app";
  prompt: string;
  imageUrl?: string;
  videoUrl?: string;
};

const LS_ADS_STUDIO_HISTORY = "ugc_ads_studio_history_v1";

const PRESETS = [
  { id: "hyper-motion", label: "Hyper Motion", suffix: "Fast cuts, dynamic camera movement, high energy ad pacing." },
  { id: "unboxing", label: "Unboxing", suffix: "Natural handheld unboxing feel, authentic creator tone, close detail shots." },
  { id: "ugc", label: "UGC", suffix: "Creator-style social ad, candid phone footage vibe, realistic lighting." },
] as const;

async function pollNanoTask(taskId: string, personalApiKey?: string): Promise<string[]> {
  const max = 90;
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < max; i++) {
    const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${keyParam}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { successFlag?: number; response?: Record<string, unknown>; errorMessage?: string };
      error?: string;
    };
    if (!res.ok || !json.data) throw new Error(json.error || "Image poll failed");
    const s = json.data.successFlag ?? 0;
    if (s === 0) {
      await new Promise((r) => setTimeout(r, 1800));
      continue;
    }
    if (s === 1) {
      const resp = json.data.response ?? {};
      const candidates: unknown[] = [
        (resp as { resultImageUrl?: unknown }).resultImageUrl,
        (resp as { resultUrls?: unknown }).resultUrls,
        (resp as { resultUrl?: unknown }).resultUrl,
        (resp as { result_image_url?: unknown }).result_image_url,
      ];
      const urls = candidates.flatMap((v) => {
        if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
        if (typeof v === "string") return [v];
        return [];
      });
      if (!urls.length) throw new Error("No image URL in result.");
      return urls;
    }
    throw new Error(json.data.errorMessage || "Image generation failed.");
  }
  throw new Error("Timeout waiting for image.");
}

async function pollVideo(taskId: string, personalApiKey?: string, piapiApiKey?: string): Promise<string> {
  const max = 120;
  const keyParam = `${personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : ""}${piapiApiKey ? `&piapiApiKey=${encodeURIComponent(piapiApiKey)}` : ""}`;
  for (let i = 0; i < max; i++) {
    const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}${keyParam}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { status?: string; response?: string[]; error_message?: string | null };
      error?: string;
    };
    if (!res.ok || !json.data) throw new Error(json.error || "Video poll failed");
    const st = json.data.status ?? "IN_PROGRESS";
    if (st === "IN_PROGRESS") {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (st === "SUCCESS") {
      const u = json.data.response?.[0];
      if (!u || typeof u !== "string") throw new Error("Video ready but no output URL.");
      return u;
    }
    throw new Error(json.data.error_message || "Video generation failed.");
  }
  throw new Error("Timeout waiting for video.");
}

export default function AdsStudioPanel() {
  const { planId } = useCreditsPlan();
  const [assetType, setAssetType] = useState<"product" | "app">("product");
  const [prompt, setPrompt] = useState("");
  const [appRefUrl, setAppRefUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<AdsStudioHistoryItem[]>([]);
  const appInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_ADS_STUDIO_HISTORY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AdsStudioHistoryItem[];
      if (!Array.isArray(parsed)) return;
      setHistory(parsed.filter((x) => x && typeof x.id === "string").slice(0, 24));
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

  const canGenerate = useMemo(() => prompt.trim().length > 0 && !isGenerating, [prompt, isGenerating]);

  async function uploadRef(file: File, kind: "app" | "avatar") {
    try {
      const url = await uploadFileToCdn(file, { kind: "image" });
      if (kind === "app") setAppRefUrl(url);
      else setAvatarUrl(url);
      toast.success(kind === "app" ? "App reference uploaded" : "Avatar uploaded");
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  async function runGenerate() {
    const p = prompt.trim();
    if (!p) return;
    const personalApiKey = getPersonalApiKey();
    const piapiApiKey = getPersonalPiapiApiKey();
    setIsGenerating(true);
    setImageUrl(null);
    setVideoUrl(null);
    try {
      const enrichedPrompt =
        assetType === "app"
          ? `${p}\n\nCreate an APP-focused ad visual (UI usage, mobile screen context, feature/value outcomes).`
          : `${p}\n\nCreate a PRODUCT-focused ad visual (packaging, product handling, realistic creator environment).`;
      const imageRes = await fetch("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountPlan: planId,
          model: "pro",
          prompt: enrichedPrompt,
          imageUrls: appRefUrl.trim() ? [appRefUrl.trim()] : undefined,
          resolution: "2K",
          aspectRatio: "9:16",
          personalApiKey: personalApiKey ?? undefined,
        }),
      });
      const imageJson = (await imageRes.json()) as { taskId?: string; error?: string };
      if (!imageRes.ok || !imageJson.taskId) throw new Error(imageJson.error || "Image generation failed");
      toast.message("Image generation started");
      const imageUrls = await pollNanoTask(imageJson.taskId, personalApiKey ?? undefined);
      const firstImage = imageUrls[0] ?? "";
      if (!firstImage) throw new Error("No generated image URL.");
      setImageUrl(firstImage);

      const videoPrompt = `${enrichedPrompt}\n\nMake this a high-converting short vertical ad clip.`;
      const videoRes = await fetch("/api/kling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountPlan: planId,
          marketModel: "kling-2.5-turbo/image-to-video",
          prompt: videoPrompt,
          imageUrl: firstImage,
          duration: 5,
          aspectRatio: "9:16",
          sound: true,
          personalApiKey: personalApiKey ?? undefined,
          piapiApiKey: piapiApiKey ?? undefined,
        }),
      });
      const videoJson = (await videoRes.json()) as { taskId?: string; error?: string };
      if (!videoRes.ok || !videoJson.taskId) throw new Error(videoJson.error || "Video generation failed");
      toast.message("Video generation started");
      const vUrl = await pollVideo(videoJson.taskId, personalApiKey ?? undefined, piapiApiKey ?? undefined);
      setVideoUrl(vUrl);
      const item: AdsStudioHistoryItem = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        assetType,
        prompt: p,
        imageUrl: firstImage,
        videoUrl: vUrl,
      };
      setHistory((prev) => [item, ...prev].slice(0, 24));
      toast.success("Ads Studio generation complete");
    } catch (err) {
      toast.error("Ads Studio", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-[radial-gradient(120%_120%_at_10%_0%,rgba(236,72,153,0.28),rgba(15,10,25,0.75)_45%,rgba(5,5,10,0.92)_100%)] p-4 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Marketing Studio</p>
        <h2 className="mt-2 text-3xl font-black uppercase leading-tight text-white sm:text-4xl">Turn Any Product Into A Video Ad</h2>

        <div className="mt-5 flex gap-3">
          <div className="flex w-16 shrink-0 flex-col gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
            <button
              type="button"
              onClick={() => setAssetType("product")}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-xl text-[10px] font-semibold transition",
                assetType === "product" ? "bg-white text-black" : "bg-white/5 text-white/70 hover:bg-white/10",
              )}
            >
              <Package2 className="mb-1 h-3.5 w-3.5" />
              Product
            </button>
            <button
              type="button"
              onClick={() => setAssetType("app")}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-xl text-[10px] font-semibold transition",
                assetType === "app" ? "bg-white text-black" : "bg-white/5 text-white/70 hover:bg-white/10",
              )}
            >
              <Smartphone className="mb-1 h-3.5 w-3.5" />
              App
            </button>
          </div>

          <div className="flex min-w-0 flex-1 items-end gap-2 rounded-2xl border border-white/10 bg-black/35 p-3">
            <div className="min-w-0 flex-1">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the ad you want to generate..."
                className="min-h-[110px] resize-y border-white/10 bg-black/30 text-white placeholder:text-white/35"
              />
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-white/70">
                <span className="rounded-md border border-white/15 px-2 py-1">UGC</span>
                <span className="rounded-md border border-white/15 px-2 py-1">Mobile</span>
                <span className="rounded-md border border-white/15 px-2 py-1">9:16</span>
                <span className="rounded-md border border-white/15 px-2 py-1">5s</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex flex-col gap-2">
                <Button type="button" size="sm" variant="outline" className="border-white/20 bg-white/5 text-white" onClick={() => appInputRef.current?.click()}>
                  <Plus className="mr-1 h-3 w-3" />
                  APP
                </Button>
                <Button type="button" size="sm" variant="outline" className="border-white/20 bg-white/5 text-white" onClick={() => avatarInputRef.current?.click()}>
                  <Plus className="mr-1 h-3 w-3" />
                  AVATAR
                </Button>
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
              </div>
              <Button
                type="button"
                onClick={() => void runGenerate()}
                disabled={!canGenerate}
                className="h-11 rounded-xl bg-pink-500 px-5 font-bold text-white hover:bg-pink-400"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {isGenerating ? "Generating..." : "Generate"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-white/85">Generate across formats</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setPrompt((prev) => `${prev.trim() ? `${prev.trim()}\n` : ""}${preset.suffix}`)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-5 text-left text-white transition hover:border-pink-300/40 hover:bg-white/5"
            >
              <p className="text-sm font-bold">{preset.label}</p>
              <p className="mt-1 text-xs text-white/55">{preset.suffix}</p>
            </button>
          ))}
        </div>
      </div>

      {(imageUrl || videoUrl) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/55">Generated Image</p>
            {imageUrl ? <img src={imageUrl} alt="Generated ad visual" className="w-full rounded-lg object-cover" /> : <p className="text-sm text-white/40">Waiting...</p>}
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/55">Generated Video</p>
            {videoUrl ? <video src={videoUrl} controls className="w-full rounded-lg" /> : <p className="text-sm text-white/40">Waiting...</p>}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/55">Ads Studio History</p>
        {history.length === 0 ? (
          <p className="text-sm text-white/45">No generations yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50">{item.assetType}</span>
                  <span className="text-[10px] text-white/40">{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <p className="line-clamp-2 text-xs text-white/75">{item.prompt}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

