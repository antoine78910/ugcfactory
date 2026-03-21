"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { IMAGE_MODEL } from "@/lib/pricing";

const ASPECT_RATIOS = [
  "1:1",
  "9:16",
  "16:9",
  "3:4",
  "4:3",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
] as const;

const PRO_RESOLUTIONS = ["1K", "2K", "4K"] as const;

type NanoModel = "nano" | "pro";

/** Credits from product spec (`@/lib/pricing`). */
const CREDITS_BY_MODEL: Record<NanoModel, number> = {
  nano: IMAGE_MODEL.nanobanana_standard.credits,
  pro: IMAGE_MODEL.nanobanana_pro.credits,
};

async function uploadReferenceFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
  return json.url;
}

async function pollNanoTask(taskId: string): Promise<string[]> {
  const max = 90;
  for (let i = 0; i < max; i++) {
    const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { successFlag?: number; response?: Record<string, unknown>; errorMessage?: string };
      error?: string;
    };
    if (!res.ok || !json.data) throw new Error(json.error || "Poll failed");
    const s = json.data.successFlag ?? 0;
    if (s === 0) {
      await new Promise((r) => setTimeout(r, 2500));
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
    throw new Error(json.data.errorMessage || "Generation failed.");
  }
  throw new Error("Timeout waiting for NanoBanana.");
}

export default function StudioImagePanel() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<NanoModel>("pro");
  const [aspect, setAspect] = useState<string>("3:4");
  const [resolution, setResolution] = useState<(typeof PRO_RESOLUTIONS)[number]>("2K");
  const [numImages, setNumImages] = useState(1);
  const [refUrls, setRefUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    if (model === "nano" && aspect === "auto") setAspect("3:4");
  }, [model, aspect]);

  const onAddRefs = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return;
      setBusy(true);
      try {
        const urls: string[] = [];
        for (const f of files.slice(0, 8)) {
          urls.push(await uploadReferenceFile(f));
        }
        setRefUrls((prev) => [...prev, ...urls].slice(0, 12));
        toast.success(`${urls.length} reference image(s) added`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  }, []);

  const generate = async () => {
    const p = prompt.trim();
    if (!p) {
      toast.error("Describe the scene you imagine.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        prompt: p,
        model,
        imageUrls: refUrls.length ? refUrls : undefined,
      };
      if (model === "pro") {
        body.resolution = resolution;
        body.aspectRatio = aspect;
      } else {
        body.imageSize = aspect;
        body.numImages = Math.min(4, Math.max(1, numImages));
      }
      const res = await fetch("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Generate failed");
      toast.message("Generation started", { description: "Polling NanoBanana…" });
      const urls = await pollNanoTask(json.taskId);
      setResults((prev) => [...urls, ...prev]);
      toast.success("Image ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const generateBtnClass =
    "h-14 w-full rounded-2xl border border-violet-300/40 bg-violet-500 text-lg font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none";

  const resultsOutput = (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Recent generations</p>
      <div className="flex flex-col gap-4">
        {results.map((u) => (
          <div key={u} className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            <a href={u} target="_blank" rel="noreferrer" className="block bg-[#0b0912]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="max-h-[min(520px,70vh)] w-full object-contain object-center" />
            </a>
            <div className="border-t border-white/10 p-3">
              <a
                href={`/api/download?url=${encodeURIComponent(u)}`}
                className="text-sm font-medium text-violet-300 underline"
              >
                Download
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
      <aside className="flex min-w-0 flex-col gap-4 lg:w-[min(100%,22rem)] xl:w-[min(100%,26rem)] lg:shrink-0 lg:max-h-[min(90vh,calc(100vh-10rem))] lg:overflow-y-auto lg:pr-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Create — parameters</p>
        <div className="rounded-2xl border border-white/10 bg-[#101014] p-4">
          <div className="flex min-h-[100px] flex-col gap-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                title="Add reference images"
                disabled={busy}
                onClick={onAddRefs}
              >
                <Plus className="h-5 w-5" />
              </Button>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the scene you imagine."
                className="min-h-[100px] flex-1 resize-none border-white/10 bg-[#0a0a0d] px-3 py-3 text-sm text-white placeholder:text-white/35 focus-visible:ring-0"
                rows={4}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                ✨ Studio
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#101014] p-4">
          <Label className="text-xs text-white/45">Model</Label>
          <div className="mt-2 flex flex-col gap-2">
            <Select value={model} onValueChange={(v) => setModel(v as NanoModel)}>
              <SelectTrigger className="h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pro">Nano Banana Pro</SelectItem>
                <SelectItem value="nano">Nano Banana</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={aspect} onValueChange={setAspect}>
                <SelectTrigger className="h-12 min-w-[6rem] flex-1 rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                  <SelectValue placeholder="Ratio" />
                </SelectTrigger>
                <SelectContent>
                  {model === "pro" ? <SelectItem value="auto">auto</SelectItem> : null}
                  {ASPECT_RATIOS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {model === "pro" ? (
                <Select value={resolution} onValueChange={(v) => setResolution(v as (typeof PRO_RESOLUTIONS)[number])}>
                  <SelectTrigger className="h-12 w-[88px] rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRO_RESOLUTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-12 flex-1 items-center justify-center gap-1 rounded-xl border border-white/15 bg-[#0a0a0d] px-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/10"
                    disabled={busy || numImages <= 1}
                    onClick={() => setNumImages((n) => Math.max(1, n - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[3rem] text-center text-xs font-medium text-white/80">{numImages}/4</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-white/10"
                    disabled={busy || numImages >= 4}
                    onClick={() => setNumImages((n) => Math.min(4, n + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {refUrls.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#101014] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Reference images</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {refUrls.map((u, i) => (
                <button
                  key={`${u}-${i}`}
                  type="button"
                  className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/15"
                  title="Remove"
                  onClick={() => setRefUrls((prev) => prev.filter((_, j) => j !== i))}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                    Remove
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <Button type="button" disabled={busy} onClick={() => void generate()} className={generateBtnClass}>
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <span className="inline-flex items-center gap-2">
              Generate
              <Sparkles className="h-5 w-5" />
              <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">
                {CREDITS_BY_MODEL[model]}
              </span>
            </span>
          )}
        </Button>
      </aside>

      <StudioOutputPane
        title="Generations"
        hasOutput={results.length > 0}
        output={resultsOutput}
        empty={<StudioEmptyExamples variant="image" />}
      />
    </div>
  );
}
