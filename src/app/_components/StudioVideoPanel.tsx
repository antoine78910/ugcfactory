"use client";

import { useCallback, useState } from "react";
import { ImageIcon, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";

type VideoTab = "create" | "edit";

type VideoModelId =
  | "kling-3.0/video"
  | "bytedance/seedance-1.5-pro"
  | "bytedance/seedance-2.0-pro"
  | "veo3_fast"
  | "veo3";

const MODEL_OPTIONS: { id: VideoModelId; label: string; family: "kie" | "veo" }[] = [
  { id: "kling-3.0/video", label: "Kling 3.0", family: "kie" },
  { id: "bytedance/seedance-1.5-pro", label: "Seedance 1.5 Pro", family: "kie" },
  { id: "bytedance/seedance-2.0-pro", label: "Seedance 2.0 Pro", family: "kie" },
  { id: "veo3_fast", label: "Veo 3 Fast", family: "veo" },
  { id: "veo3", label: "Veo 3", family: "veo" },
];

const CREDITS_SHOWN = 21;

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
  return json.url;
}

function FrameSlot({
  label,
  optional,
  url,
  onPick,
  onClear,
  disabled,
}: {
  label: string;
  optional?: boolean;
  url: string | null;
  onPick: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (url ? onClear() : onPick())}
      className="relative flex aspect-[4/3] w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-[#0c0c10] text-white/50 transition hover:border-violet-400/40 hover:bg-white/[0.03] disabled:opacity-50"
    >
      {optional ? (
        <span className="absolute right-2 top-2 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
          Optional
        </span>
      ) : null}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 h-full w-full rounded-xl object-cover" />
      ) : (
        <>
          <ImageIcon className="mb-2 h-8 w-8 opacity-50" />
          <span className="text-xs font-medium text-white/45">{label}</span>
        </>
      )}
      {url ? (
        <span className="absolute bottom-2 rounded-md bg-black/70 px-2 py-1 text-[10px] text-white">Tap to remove</span>
      ) : null}
    </button>
  );
}

async function pollKlingVideo(taskId: string): Promise<string> {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { status?: string; response?: string[]; error_message?: string | null };
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Kling status failed");
    const st = json.data?.status;
    if (st === "SUCCESS") {
      const u = json.data?.response?.[0];
      if (!u) throw new Error("No video URL");
      return u;
    }
    if (st === "FAILED") throw new Error(json.data?.error_message || "Kling failed");
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Kling timeout");
}

async function pollVeoVideo(taskId: string): Promise<string> {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`/api/kie/veo/status?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { successFlag?: number; errorMessage?: string | null; response?: { resultUrls?: string[] } };
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Veo status failed");
    const d = json.data;
    if (!d) throw new Error("No data");
    if (d.successFlag === 1) {
      const u = d.response?.resultUrls?.[0];
      if (!u) throw new Error("No video URL");
      return u;
    }
    if (d.successFlag === 2 || d.successFlag === 3) {
      throw new Error(d.errorMessage || "Veo generation failed");
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Veo timeout");
}

export default function StudioVideoPanel() {
  const [tab, setTab] = useState<VideoTab>("create");
  const [startUrl, setStartUrl] = useState<string | null>(null);
  const [endUrl, setEndUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [multiShot, setMultiShot] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [modelId, setModelId] = useState<VideoModelId>("kling-3.0/video");
  const [duration, setDuration] = useState("12");
  const [aspect, setAspect] = useState("9:16");
  const [klingMode, setKlingMode] = useState<"std" | "pro">("std");
  const [veoAspect, setVeoAspect] = useState<"16:9" | "9:16" | "Auto">("9:16");
  const [busy, setBusy] = useState(false);
  /** Newest first — shown above the form */
  const [videoHistory, setVideoHistory] = useState<string[]>([]);

  const meta = MODEL_OPTIONS.find((m) => m.id === modelId)!;

  const pickFrame = useCallback((which: "start" | "end") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setBusy(true);
      try {
        const u = await uploadFile(f);
        if (which === "start") setStartUrl(u);
        else setEndUrl(u);
        toast.success("Frame uploaded");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  }, []);

  const durationChoices =
    modelId === "bytedance/seedance-1.5-pro"
      ? ["4", "8", "12"]
      : modelId.startsWith("bytedance/seedance-2")
        ? ["4", "6", "8", "10", "12"]
        : ["5", "10", "12", "15"];

  const generate = async () => {
    const p = prompt.trim();
    if (!p) {
      toast.error("Describe your video.");
      return;
    }
    if (meta.family === "kie" && modelId !== "kling-3.0/video" && !startUrl) {
      toast.error("Seedance needs a start frame image.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      if (meta.family === "veo") {
        const urls = [startUrl, endUrl].filter(Boolean) as string[];
        let generationType: "TEXT_2_VIDEO" | "FIRST_AND_LAST_FRAMES_2_VIDEO" | "REFERENCE_2_VIDEO" =
          "TEXT_2_VIDEO";
        if (urls.length >= 2) generationType = "FIRST_AND_LAST_FRAMES_2_VIDEO";
        else if (urls.length === 1) generationType = "REFERENCE_2_VIDEO";

        const res = await fetch("/api/kie/veo/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: p,
            model: modelId === "veo3" ? "veo3" : "veo3_fast",
            aspectRatio: veoAspect,
            generationType,
            imageUrls: urls.length ? urls : undefined,
          }),
        });
        const json = (await res.json()) as { taskId?: string; error?: string };
        if (!res.ok || !json.taskId) throw new Error(json.error || "Veo failed");
        toast.message("Veo started", { description: "Rendering…" });
        const url = await pollVeoVideo(json.taskId);
        setVideoHistory((h) => [url, ...h]);
        toast.success("Video ready");
        return;
      }

      // KIE market (Kling / Seedance)
      const res = await fetch("/api/kling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketModel: modelId,
          prompt: p,
          imageUrl: startUrl ?? undefined,
          duration: Number(duration),
          aspectRatio: modelId === "kling-3.0/video" && !startUrl ? aspect : undefined,
          sound: soundOn,
          mode: modelId === "kling-3.0/video" ? klingMode : undefined,
          multiShots: modelId === "kling-3.0/video" ? multiShot : undefined,
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Video task failed");
      toast.message("Generation started", { description: "Polling provider…" });
      const url = await pollKlingVideo(json.taskId);
      setVideoHistory((h) => [url, ...h]);
      toast.success("Video ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const videoResultsOutput = (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Recent generations</p>
      <div className="flex flex-col gap-4">
        {videoHistory.map((u) => (
          <div key={u} className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video src={u} controls className="max-h-[520px] w-full" />
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

  const generateBtnClass =
    "h-14 w-full rounded-2xl border border-violet-300/40 bg-violet-500 text-lg font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className={`rounded-full ${tab === "create" ? "bg-white text-black hover:bg-white/90" : "border-white/15 bg-white/5 text-white"}`}
          onClick={() => setTab("create")}
        >
          Create Video
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className={`rounded-full ${tab === "edit" ? "bg-white text-black hover:bg-white/90" : "border-white/15 bg-white/5 text-white"}`}
          onClick={() => setTab("edit")}
        >
          Edit Video
        </Button>
      </div>

      {tab === "edit" ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
          <aside className="flex min-w-0 flex-col gap-3 rounded-2xl border border-white/10 bg-[#101014] p-4 lg:w-[min(100%,22rem)] lg:shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Edit video</p>
            <div className="text-sm text-white/55">
              Edit Video tools will be available here soon. Use{" "}
              <strong className="text-white/80">Motion Control</strong> in the sidebar for motion-reference workflows.
            </div>
          </aside>
          <StudioOutputPane
            title="Generations"
            hasOutput={false}
            output={null}
            empty={<StudioEmptyExamples variant="video" />}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
          <aside className="flex min-w-0 flex-col gap-4 lg:w-[min(100%,22rem)] xl:w-[min(100%,26rem)] lg:shrink-0 lg:max-h-[min(90vh,calc(100vh-10rem))] lg:overflow-y-auto lg:pr-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Create — parameters</p>
            <div className="grid grid-cols-2 gap-2">
              <FrameSlot
                label="Start frame"
                url={startUrl}
                disabled={busy}
                onPick={() => pickFrame("start")}
                onClear={() => setStartUrl(null)}
              />
              <FrameSlot
                label="End frame"
                optional
                url={endUrl}
                disabled={busy}
                onPick={() => pickFrame("end")}
                onClear={() => setEndUrl(null)}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#101014] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-white/80">
                  <span>Multi-shot</span>
                  <span className="text-xs text-white/35" title="Kling 3.0 only">
                    ⓘ
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy || modelId !== "kling-3.0/video"}
                  onClick={() => setMultiShot((m) => !m)}
                  className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                    multiShot
                      ? "border-violet-400/50 bg-violet-500/40"
                      : "border-white/15 bg-white/10"
                  } disabled:opacity-40`}
                  aria-pressed={multiShot}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${
                      multiShot ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your video, like 'A woman walking through a neon-lit city'."
                className="min-h-[100px] border-white/10 bg-[#0a0a0d] text-white placeholder:text-white/35"
                rows={4}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                  ✨ Studio
                </span>
                <button
                  type="button"
                  onClick={() => setSoundOn((s) => !s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    soundOn
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                      : "border-white/10 bg-white/5 text-white/50"
                  }`}
                >
                  🔊 {soundOn ? "Audio on" : "Audio off"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#101014] p-4">
              <Label className="text-xs text-white/45">Model</Label>
              <Select value={modelId} onValueChange={(v) => setModelId(v as VideoModelId)}>
                <SelectTrigger className="mt-2 h-12 rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              {meta.family === "veo" ? (
                <Select value={veoAspect} onValueChange={(v) => setVeoAspect(v as typeof veoAspect)}>
                  <SelectTrigger className="h-11 w-full min-w-[120px] rounded-xl border-white/15 bg-[#101014] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16</SelectItem>
                    <SelectItem value="16:9">16:9</SelectItem>
                    <SelectItem value="Auto">Auto</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger className="h-11 w-[100px] rounded-xl border-white/15 bg-[#101014] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {durationChoices.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}s
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {modelId === "kling-3.0/video" && !startUrl ? (
                    <Select value={aspect} onValueChange={setAspect}>
                      <SelectTrigger className="h-11 w-[100px] rounded-xl border-white/15 bg-[#101014] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9:16">9:16</SelectItem>
                        <SelectItem value="16:9">16:9</SelectItem>
                        <SelectItem value="1:1">1:1</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {modelId === "kling-3.0/video" ? (
                    <Select value={klingMode} onValueChange={(v) => setKlingMode(v as "std" | "pro")}>
                      <SelectTrigger className="h-11 min-w-[120px] rounded-xl border-white/15 bg-[#101014] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="std">720p std</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {modelId.startsWith("bytedance/seedance") ? (
                    <Select value={aspect} onValueChange={setAspect}>
                      <SelectTrigger className="h-11 w-[100px] rounded-xl border-white/15 bg-[#101014] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9:16">9:16</SelectItem>
                        <SelectItem value="16:9">16:9</SelectItem>
                        <SelectItem value="1:1">1:1</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                </>
              )}
            </div>

            <Button type="button" disabled={busy} onClick={() => void generate()} className={generateBtnClass}>
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <span className="inline-flex items-center gap-2">
                  Generate
                  <Sparkles className="h-5 w-5" />
                  <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">{CREDITS_SHOWN}</span>
                </span>
              )}
            </Button>
          </aside>

          <StudioOutputPane
            title="Generations"
            hasOutput={videoHistory.length > 0}
            output={videoResultsOutput}
            empty={<StudioEmptyExamples variant="video" />}
          />
        </div>
      )}
    </div>
  );
}
