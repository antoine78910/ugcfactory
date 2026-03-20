"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

/** Placeholder credits shown in UI (billing not wired). */
const CREDITS_BY_MODEL: Record<NanoModel, number> = { nano: 1, pro: 2 };

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
    setResults([]);
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
      setResults(urls);
      toast.success("Image ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[1.25rem] border border-white/10 bg-[#101014] p-4 shadow-[0_0_40px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-3">
          <div className="flex min-h-[52px] flex-1 flex-col gap-2 rounded-2xl border border-white/10 bg-[#0a0a0d] p-2 sm:flex-row sm:items-stretch">
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
              placeholder="Describe the scene you imagine"
              className="min-h-[52px] flex-1 resize-none border-0 bg-transparent px-2 py-3 text-sm text-white placeholder:text-white/35 focus-visible:ring-0"
              rows={2}
            />
          </div>

          <Button
            type="button"
            disabled={busy}
            onClick={() => void generate()}
            className="h-auto min-h-[52px] shrink-0 rounded-2xl bg-[#c8f542] px-8 text-base font-semibold text-black shadow-none hover:bg-[#d8ff5c] lg:min-w-[200px]"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <span className="inline-flex items-center gap-2">
                Generate
                <Sparkles className="h-4 w-4" />
                <span className="rounded-md bg-black/10 px-1.5 py-0.5 text-sm tabular-nums">
                  {CREDITS_BY_MODEL[model]}
                </span>
              </span>
            )}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          <div className="flex min-w-[200px] flex-1 items-center gap-2">
            <Label className="sr-only">Model</Label>
            <Select value={model} onValueChange={(v) => setModel(v as NanoModel)}>
              <SelectTrigger className="h-10 rounded-full border-white/15 bg-white/[0.06] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pro">Nano Banana Pro</SelectItem>
                <SelectItem value="nano">Nano Banana</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Select value={aspect} onValueChange={setAspect}>
            <SelectTrigger className="h-10 w-[100px] rounded-xl border-white/15 bg-white/[0.06] text-white">
              <SelectValue placeholder="Ratio" />
            </SelectTrigger>
            <SelectContent>
              {model === "pro" ? (
                <SelectItem value="auto">auto</SelectItem>
              ) : null}
              {ASPECT_RATIOS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {model === "pro" ? (
            <Select value={resolution} onValueChange={(v) => setResolution(v as (typeof PRO_RESOLUTIONS)[number])}>
              <SelectTrigger className="h-10 w-[88px] rounded-xl border-white/15 bg-white/[0.06] text-white">
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
            <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/[0.06] px-2 py-1">
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
              <span className="min-w-[3rem] text-center text-xs font-medium text-white/80">
                {numImages}/4
              </span>
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

        {refUrls.length > 0 ? (
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
        ) : null}
      </div>

      {results.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((u) => (
            <a
              key={u}
              href={u}
              target="_blank"
              rel="noreferrer"
              className="overflow-hidden rounded-xl border border-white/10 bg-[#0b0912]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="aspect-[3/4] w-full object-cover" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
