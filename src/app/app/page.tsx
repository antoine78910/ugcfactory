"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type EngineId =
  | "kling-3.0/video"
  | "bytedance/seedance-2-image-to-video"
  | "bytedance/seedance-1.5-pro"
  | "veo3_fast"
  | "veo3";
type KlingMode = "pro" | "std";
type AspectRatio = "9:16" | "16:9" | "1:1" | "Auto";

const ENGINES: Array<{
  id: EngineId;
  label: string;
  provider: "market" | "veo";
  note?: string;
}> = [
  { id: "kling-3.0/video", label: "Kling 3.0 (KIE Market)", provider: "market" },
  {
    id: "bytedance/seedance-2-image-to-video",
    label: "Seedance 2.0 (KIE Market) — image→video",
    provider: "market",
    note: "Pas encore documenté dans docs.kie.ai → peut échouer selon accès/KIE.",
  },
  {
    id: "bytedance/seedance-1.5-pro",
    label: "Seedance 1.5 Pro (KIE Market) — image→video",
    provider: "market",
    note: "Documenté (durées 4/8/12).",
  },
  { id: "veo3_fast", label: "Veo 3.1 Fast (KIE)", provider: "veo" },
  { id: "veo3", label: "Veo 3.1 Quality (KIE)", provider: "veo" },
];

const RATIOS_MARKET: Array<{ id: AspectRatio; label: string }> = [
  { id: "9:16", label: "9:16 (default)" },
  { id: "16:9", label: "16:9" },
  { id: "1:1", label: "1:1" },
];

const RATIOS_VEO: Array<{ id: AspectRatio; label: string }> = [
  { id: "9:16", label: "9:16 (default)" },
  { id: "16:9", label: "16:9" },
  { id: "Auto", label: "Auto" },
];

const KLING_MODES: Array<{ id: KlingMode; label: string }> = [
  { id: "pro", label: "Pro" },
  { id: "std", label: "Std" },
];

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "generating"; taskId: string; provider: "market" | "veo" }
  | { kind: "success"; taskId: string; videoUrl: string }
  | { kind: "error"; message: string };

export default function AppI2V() {
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [engineId, setEngineId] = useState<EngineId>("kling-3.0/video");
  const [klingMode, setKlingMode] = useState<KlingMode>("pro");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [duration, setDuration] = useState<number>(10);
  const [sound, setSound] = useState(true); // default ON

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const taskId = status.kind === "generating" || status.kind === "success" ? status.taskId : null;
  const videoUrl = status.kind === "success" ? status.videoUrl : null;

  const engineMeta = useMemo(
    () => ENGINES.find((m) => m.id === engineId) ?? ENGINES[0],
    [engineId],
  );

  const ratioOptions = useMemo(
    () => (engineMeta.provider === "veo" ? RATIOS_VEO : RATIOS_MARKET),
    [engineMeta.provider],
  );

  const durationOptions = useMemo(() => {
    if (engineMeta.provider === "veo") return [8];
    if (engineId === "bytedance/seedance-1.5-pro") return [4, 8, 12];
    if (engineId === "bytedance/seedance-2-image-to-video")
      return Array.from({ length: 12 }, (_, i) => i + 4); // 4..15
    return Array.from({ length: 13 }, (_, i) => i + 3); // 3..15 (Kling 3.0)
  }, [engineId, engineMeta.provider]);

  const downloadHref = useMemo(() => {
    if (!videoUrl) return null;
    return `/api/download?url=${encodeURIComponent(videoUrl)}`;
  }, [videoUrl]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    // keep duration valid when switching models
    if (!durationOptions.includes(duration)) setDuration(durationOptions[0] ?? 10);
  }, [duration, durationOptions]);

  useEffect(() => {
    const allowed = new Set(ratioOptions.map((r) => r.id));
    if (!allowed.has(aspectRatio)) setAspectRatio("9:16");
  }, [aspectRatio, ratioOptions]);

  async function uploadImage(currentFile: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", currentFile);

    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    const json = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
    return json.url;
  }

  async function onGenerate() {
    const p = prompt.trim();
    if (!p) {
      toast.error("Ajoute un prompt.");
      return;
    }
    if (!file) {
      toast.error("Ajoute une image.");
      return;
    }

    setIsSubmitting(true);
    setIsVideoLoading(false);
    setStatus({ kind: "uploading" });

    try {
      const imageUrl = await uploadImage(file);

      const res =
        engineMeta.provider === "veo"
          ? await fetch("/api/kie/veo/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: p,
                model: engineId, // veo3_fast | veo3
                aspectRatio: aspectRatio === "1:1" ? "Auto" : aspectRatio,
                generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
                imageUrls: [imageUrl],
              }),
            })
          : await fetch("/api/kling/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                marketModel: engineId,
                prompt: p,
                imageUrl,
                aspectRatio: aspectRatio === "Auto" ? "9:16" : aspectRatio,
                duration,
                sound,
                mode: klingMode,
              }),
            });

      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Generate failed");

      setStatus({ kind: "generating", taskId: json.taskId, provider: engineMeta.provider });
      toast.success("Vidéo lancée", { description: json.taskId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setStatus({ kind: "error", message });
      toast.error("Erreur", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (status.kind !== "generating") return;
    const currentTaskId = status.taskId;
    const provider = status.provider;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        if (provider === "veo") {
          const res = await fetch(
            `/api/kie/veo/status?taskId=${encodeURIComponent(currentTaskId)}`,
            { method: "GET", cache: "no-store" },
          );
          const json = (await res.json()) as {
            data?: {
              successFlag?: 0 | 1 | 2 | 3;
              errorMessage?: string | null;
              response?: { resultUrls?: string[] };
            };
            error?: string;
          };
          if (!res.ok || !json.data) throw new Error(json.error || "Polling failed");
          if (cancelled) return;

          const s = json.data.successFlag ?? 0;
          if (s === 0) return;
          if (s === 1) {
            const url = json.data.response?.resultUrls?.[0];
            if (!url) throw new Error("Video succeeded but resultUrls[0] is missing.");
            setIsVideoLoading(true);
            setStatus({ kind: "success", taskId: currentTaskId, videoUrl: url });
            if (interval) clearInterval(interval);
            interval = null;
            return;
          }
          throw new Error(json.data.errorMessage || `Video failed: ${String(s)}`);
        } else {
          const res = await fetch(
            `/api/kling/status?taskId=${encodeURIComponent(currentTaskId)}`,
            { method: "GET", cache: "no-store" },
          );
          const json = (await res.json()) as {
            data?: { status?: string; response?: string[]; error_message?: string | null };
            error?: string;
          };
          if (!res.ok || !json.data) throw new Error(json.error || "Polling failed");
          if (cancelled) return;

          const s = json.data.status ?? "IN_PROGRESS";
          if (s === "IN_PROGRESS") return;
          if (s === "SUCCESS") {
            const url = json.data.response?.[0];
            if (!url) throw new Error("Video succeeded but response[0] is missing.");
            setIsVideoLoading(true);
            setStatus({ kind: "success", taskId: currentTaskId, videoUrl: url });
            if (interval) clearInterval(interval);
            interval = null;
            return;
          }
          throw new Error(json.data.error_message || `Video failed: ${s}`);
        }
      } catch (err) {
        if (cancelled) return;
        setStatus({ kind: "error", message: err instanceof Error ? err.message : "Unknown error." });
        if (interval) clearInterval(interval);
        interval = null;
      }
    }

    tick();
    interval = setInterval(tick, 4000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [status]);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Image → Vidéo</h1>
            <p className="text-sm text-muted-foreground">
              Upload une image + écris un prompt → génération vidéo. Default: 9:16, audio ON, 1 génération.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">task: {taskId ?? "—"}</Badge>
            {status.kind === "idle" && <Badge variant="outline">IDLE</Badge>}
            {(status.kind === "uploading" || status.kind === "generating") && (
              <Badge className="bg-blue-600 text-white hover:bg-blue-600">GENERATING</Badge>
            )}
            {status.kind === "success" && (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">SUCCESS</Badge>
            )}
            {status.kind === "error" && (
              <Badge className="bg-red-600 text-white hover:bg-red-600">ERROR</Badge>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[420px_1fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Paramètres</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Image</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-center transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting || status.kind === "generating" || status.kind === "uploading"}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {file ? "Changer l’image" : "Upload image"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  PNG/JPG/WebP. (L’image est uploadée via `/api/uploads`.)
                </p>
                {previewUrl && (
                  <div className="overflow-hidden rounded-md border bg-background/30">
                    <img src={previewUrl} alt="Preview upload" className="h-44 w-full object-contain" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  placeholder="Ex: Style UGC TikTok, caméra smartphone, lumière naturelle, la personne tourne le produit..."
                  className="bg-background/30 text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Modèle</Label>
                  <Select value={engineId} onValueChange={(v) => setEngineId(v as EngineId)}>
                    <SelectTrigger className="bg-background/30 text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      {ENGINES.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {engineMeta.note && <p className="text-xs text-muted-foreground">{engineMeta.note}</p>}
                  {engineMeta.provider === "veo" && (
                    <p className="text-xs text-muted-foreground">
                      Veo 3.1: clips limités à 8s (doc KIE). Audio expérimental, pas de switch dans l’API.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
                    <SelectTrigger className="bg-background/30 text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      {ratioOptions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {engineId === "kling-3.0/video" && (
                <div className="space-y-2">
                  <Label>Qualité (Kling)</Label>
                  <Select value={klingMode} onValueChange={(v) => setKlingMode(v as KlingMode)}>
                    <SelectTrigger className="bg-background/30 text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      {KLING_MODES.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Durée</Label>
                  <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                    <SelectTrigger className="bg-background/30 text-foreground" disabled={engineMeta.provider === "veo"}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      {durationOptions.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}s
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {engineMeta.provider === "veo"
                      ? "Veo 3.1: durée fixe 8s."
                      : engineId === "bytedance/seedance-1.5-pro"
                        ? "Seedance 1.5 Pro: 4 / 8 / 12s (doc KIE)."
                        : engineId.startsWith("bytedance/seedance-2")
                          ? "Seedance 2.0: 4–15s (selon KIE)."
                          : "Kling 3.0: 3–15s."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Audio</Label>
                  <Button
                    type="button"
                    variant={sound ? "default" : "secondary"}
                    onClick={() => setSound((v) => !v)}
                    className="w-full transition-colors"
                    disabled={engineMeta.provider === "veo"}
                  >
                    {sound ? "Audio ON" : "Audio OFF"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Génération</Label>
                  <div className="flex items-center gap-2">
                    <Badge className="w-full justify-center bg-background/30 text-foreground hover:bg-background/30">
                      1 vidéo
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={onGenerate}
                  disabled={
                    isSubmitting ||
                    status.kind === "generating" ||
                    status.kind === "uploading" ||
                    !file
                  }
                  className="transition-colors"
                >
                  {(isSubmitting || status.kind === "uploading") && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Générer
                </Button>
              </div>

              {status.kind === "error" && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                  {status.message}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Output</CardTitle>
              {downloadHref && (
                <Button asChild variant="secondary">
                  <a href={downloadHref}>Télécharger</a>
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {!videoUrl && (
                <div className="flex min-h-[360px] items-center justify-center rounded-md border border-dashed bg-background/30 text-sm text-muted-foreground">
                  {status.kind === "uploading" || status.kind === "generating"
                    ? "Génération en cours…"
                    : "La vidéo apparaîtra ici après génération."}
                </div>
              )}

              {videoUrl && (
                <div className="relative overflow-hidden rounded-md border bg-black">
                  {isVideoLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
                      <div className="flex items-center gap-3 text-sm text-zinc-200">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Chargement de la vidéo…
                      </div>
                    </div>
                  )}
                  <video
                    src={videoUrl}
                    controls
                    playsInline
                    className="h-[520px] w-full object-contain"
                    onLoadedData={() => setIsVideoLoading(false)}
                    onError={() => setIsVideoLoading(false)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

