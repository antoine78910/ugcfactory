"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { NanoBananaImageSize } from "@/lib/nanobanana";
import type { KlingAspectRatio } from "@/lib/kling3";
import type { NanoBananaProResolution } from "@/lib/nanobanana";
import type { KieVeoAspectRatio, KieVeoModel } from "@/lib/kie";

type Lang = "fr" | "en";

const UI = {
  fr: {
    title: "UGC Automation (MVP)",
    subtitle:
      "Upload ton produit + écris un prompt → génération/édition via NanoBanana.",
    language: "Langue",
    prompt: "Prompt",
    productImage: "Image du produit",
    aspectRatio: "Format",
    generate: "Générer",
    reset: "Réinitialiser",
    task: "Task",
    result: "Résultat",
    noteTitle: "Note importante (local)",
    note:
      "Pour l’édition (image produit), NanoBanana doit pouvoir accéder à l’URL de l’image et au callback. En local, utilise un tunnel (ex: ngrok) et configure APP_URL.",
  },
  en: {
    title: "UGC Automation (MVP)",
    subtitle:
      "Upload your product + write a prompt → generate/edit via NanoBanana.",
    language: "Language",
    prompt: "Prompt",
    productImage: "Product image",
    aspectRatio: "Aspect ratio",
    generate: "Generate",
    reset: "Reset",
    task: "Task",
    result: "Result",
    noteTitle: "Important note (local)",
    note:
      "For image editing (product image), NanoBanana must access the public image URL and your callback URL. In local dev, use a tunnel (e.g. ngrok) and set APP_URL.",
  },
} satisfies Record<Lang, Record<string, string>>;

const IMAGE_SIZES: Array<{ label: string; value: NanoBananaImageSize }> = [
  { label: "1:1", value: "1:1" },
  { label: "4:5", value: "4:5" },
  { label: "3:4", value: "3:4" },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
];

const VEO_MODELS: Array<{ id: KieVeoModel; label: string }> = [
  { id: "veo3_fast", label: "Veo 3.1 Fast" },
  { id: "veo3", label: "Veo 3.1 Quality" },
];

const VEO_RATIOS: Array<{ label: string; value: KieVeoAspectRatio }> = [
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "Auto", value: "Auto" },
];

type VideoProvider = "kie" | "kling";
type VideoSource = "generated" | "upload";

type KlingMode = "pro" | "std";

const KLING_MODES: Array<{ id: KlingMode; label: string }> = [
  { id: "pro", label: "Kling 3.0 Pro" },
  { id: "std", label: "Kling 3.0 Std" },
];

const KLING_RATIOS: Array<{ label: string; value: KlingAspectRatio }> = [
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "1:1", value: "1:1" },
];

export default function Home() {
  const [lang, setLang] = useState<Lang>("fr");
  const t = UI[lang];

  const [prompt, setPrompt] = useState("");
  const [nanoModel, setNanoModel] = useState<"nano" | "pro">("nano");
  const [imageSize, setImageSize] = useState<NanoBananaImageSize>("4:5");
  const [proResolution, setProResolution] =
    useState<NanoBananaProResolution>("2K");
  const [files, setFiles] = useState<File[]>([]);
  const [numImages, setNumImages] = useState<number>(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "generating" }
    | { kind: "success"; resultImageUrls: string[] }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const generatedImageUrls =
    status.kind === "success" ? status.resultImageUrls : null;
  const [selectedImageForVideo, setSelectedImageForVideo] = useState<
    string | null
  >(null);
  const generatedImageUrl = selectedImageForVideo;

  const [videoProvider, setVideoProvider] = useState<VideoProvider>("kie");
  const [videoSource, setVideoSource] = useState<VideoSource>("generated");
  const [videoUploadFile, setVideoUploadFile] = useState<File | null>(null);
  const [videoUploadPreviewUrl, setVideoUploadPreviewUrl] = useState<string | null>(
    null,
  );
  const [videoUploadUrl, setVideoUploadUrl] = useState<string | null>(null);

  const [videoModel, setVideoModel] = useState<KieVeoModel>("veo3_fast");
  const [videoAspectRatio, setVideoAspectRatio] =
    useState<KieVeoAspectRatio>("9:16");
  const [videoEnableTranslation, setVideoEnableTranslation] = useState(true);
  const [videoPrompt, setVideoPrompt] = useState("");

  const [klingImageType, setKlingImageType] =
    useState<KlingMode>("pro");
  const [klingImageDuration, setKlingImageDuration] = useState<number>(10);
  const [klingImageAspectRatio, setKlingImageAspectRatio] =
    useState<KlingAspectRatio>("9:16");
  const [klingImageSound, setKlingImageSound] = useState(false);

  const [isVideoSubmitting, setIsVideoSubmitting] = useState(false);
  const [videoTaskId, setVideoTaskId] = useState<string | null>(null);
  const [videoTaskProvider, setVideoTaskProvider] = useState<VideoProvider>("kie");
  const [videoStatus, setVideoStatus] = useState<
    | { kind: "idle" }
    | { kind: "generating"; providerStatus?: string }
    | { kind: "success"; videoUrl: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const [isTextVideoSubmitting, setIsTextVideoSubmitting] = useState(false);
  const [textVideoProvider, setTextVideoProvider] = useState<VideoProvider>("kie");
  const [textVideoModel, setTextVideoModel] = useState<KieVeoModel>("veo3_fast");
  const [textVideoAspectRatio, setTextVideoAspectRatio] =
    useState<KieVeoAspectRatio>("9:16");
  const [textVideoEnableTranslation, setTextVideoEnableTranslation] =
    useState(true);
  const [klingTextType, setKlingTextType] =
    useState<KlingMode>("pro");
  const [klingTextDuration, setKlingTextDuration] = useState<number>(10);
  const [klingTextAspectRatio, setKlingTextAspectRatio] =
    useState<KlingAspectRatio>("9:16");
  const [klingTextSound, setKlingTextSound] = useState(false);
  const [textVideoPrompt, setTextVideoPrompt] = useState("");
  const [textVideoTaskId, setTextVideoTaskId] = useState<string | null>(null);
  const [textVideoTaskProvider, setTextVideoTaskProvider] =
    useState<VideoProvider>("kie");
  const [textVideoStatus, setTextVideoStatus] = useState<
    | { kind: "idle" }
    | { kind: "generating"; providerStatus?: string }
    | { kind: "success"; videoUrl: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const previewUrls = useMemo(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    return urls;
  }, [files]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [previewUrls]);

  useEffect(() => {
    if (!videoUploadFile) {
      setVideoUploadPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(videoUploadFile);
    setVideoUploadPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [videoUploadFile]);

  async function uploadOne(selected: File) {
    const fd = new FormData();
    fd.append("file", selected);

    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    const json = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !json.url) {
      throw new Error(json.error || "Upload failed.");
    }
    return json.url;
  }

  async function ensureVideoUploadUrl() {
    if (videoSource !== "upload") return null;
    if (videoUploadUrl) return videoUploadUrl;
    if (!videoUploadFile) return null;
    const url = await uploadOne(videoUploadFile);
    setVideoUploadUrl(url);
    return url;
  }

  async function startTask() {
    const imageUrls =
      files.length > 0 ? await Promise.all(files.map(uploadOne)) : undefined;

    const res = await fetch("/api/nanobanana/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        language: lang,
        model: nanoModel,
        imageSize,
        resolution: nanoModel === "pro" ? proResolution : undefined,
        imageUrls,
        numImages: nanoModel === "nano" ? numImages : undefined,
      }),
    });

    const json = (await res.json()) as { taskId?: string; error?: string };
    if (!res.ok || !json.taskId) {
      throw new Error(json.error || "Generate request failed.");
    }

    return json.taskId;
  }

  async function onGenerate() {
    const p = prompt.trim();
    if (!p) {
      toast.error(lang === "fr" ? "Ajoute un prompt." : "Please enter a prompt.");
      return;
    }

    setIsSubmitting(true);
    setTaskId(null);
    setStatus({ kind: "generating" });

    try {
      const newTaskId = await startTask();
      setTaskId(newTaskId);
      toast.success(lang === "fr" ? "Tâche lancée" : "Task started", {
        description: newTaskId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setStatus({ kind: "error", message });
      toast.error(lang === "fr" ? "Erreur" : "Error", { description: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!taskId) return;

    const currentTaskId = taskId;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const res = await fetch(
          `/api/nanobanana/task?taskId=${encodeURIComponent(currentTaskId)}`,
          {
          method: "GET",
          cache: "no-store",
          },
        );
        const json = (await res.json()) as {
          data?: {
            successFlag: 0 | 1 | 2 | 3;
            errorMessage?: string;
            response?: { resultImageUrl?: string };
          };
          error?: string;
        };

        if (!res.ok || !json.data) throw new Error(json.error || "Polling failed.");
        if (cancelled) return;

        if (json.data.successFlag === 0) {
          setStatus({ kind: "generating" });
          return;
        }

        if (json.data.successFlag === 1) {
          const raw = json.data.response?.resultImageUrl as unknown;
          const urls =
            typeof raw === "string"
              ? [raw]
              : Array.isArray(raw)
                ? raw.filter((u) => typeof u === "string" && u.length > 0)
                : [];
          if (urls.length === 0) {
            throw new Error("Task succeeded but resultImageUrl is missing.");
          }
          setStatus({ kind: "success", resultImageUrls: urls });
          setSelectedImageForVideo((prev) => prev ?? urls[0] ?? null);
          if (interval) clearInterval(interval);
          interval = null;
          return;
        }

        setStatus({
          kind: "error",
          message: json.data.errorMessage || "Task failed.",
        });
        if (interval) clearInterval(interval);
        interval = null;
      } catch (err) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Unknown error.",
        });
        if (interval) clearInterval(interval);
        interval = null;
      }
    }

    tick();
    interval = setInterval(tick, 3000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [taskId]);

  useEffect(() => {
    if (!generatedImageUrls || generatedImageUrls.length === 0) return;
    // Initialize the video prompt from the image prompt (only if empty).
    setVideoPrompt((p) => (p.trim().length > 0 ? p : prompt));
    setSelectedImageForVideo((prev) => prev ?? generatedImageUrls[0] ?? null);
  }, [generatedImageUrls, prompt]);

  async function onGenerateVideo() {
    const sourceUrl =
      videoSource === "generated" ? generatedImageUrl : await ensureVideoUploadUrl();

    if (!sourceUrl) {
      toast.error(
        lang === "fr"
          ? "Ajoute une image source (générée ou upload)."
          : "Provide a source image (generated or uploaded).",
      );
      return;
    }

    const p = (videoPrompt || prompt).trim();
    if (!p) {
      toast.error(lang === "fr" ? "Ajoute un prompt vidéo." : "Enter a video prompt.");
      return;
    }

    setIsVideoSubmitting(true);
    setVideoTaskId(null);
    setVideoStatus({ kind: "generating" });

    try {
      const res =
        videoProvider === "kie"
          ? await fetch("/api/kie/veo/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: p,
                model: videoModel,
                aspectRatio: videoAspectRatio,
                enableTranslation: videoEnableTranslation,
                generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
                imageUrls: [sourceUrl],
              }),
            })
          : await fetch("/api/kling/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: klingImageType,
                prompt: p,
                imageUrl: sourceUrl,
                duration: klingImageDuration,
                aspectRatio: klingImageAspectRatio,
                sound: klingImageSound,
              }),
            });

      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) {
        throw new Error(json.error || "Video generate request failed.");
      }

      setVideoTaskId(json.taskId);
      setVideoTaskProvider(videoProvider);
      toast.success(lang === "fr" ? "Vidéo lancée" : "Video started", {
        description: json.taskId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setVideoStatus({ kind: "error", message });
      toast.error(lang === "fr" ? "Erreur vidéo" : "Video error", {
        description: message,
      });
    } finally {
      setIsVideoSubmitting(false);
    }
  }

  useEffect(() => {
    if (!videoTaskId) return;
    const currentTaskId = videoTaskId;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        if (videoTaskProvider === "kie") {
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
          if (!res.ok || !json.data) throw new Error(json.error || "Polling failed.");
          if (cancelled) return;

          const s = json.data.successFlag ?? 0;
          if (s === 0) {
            setVideoStatus({ kind: "generating", providerStatus: "GENERATING" });
            return;
          }
          if (s === 1) {
            const url = json.data.response?.resultUrls?.[0];
            if (!url) throw new Error("Video succeeded but resultUrls[0] is missing.");
            setVideoStatus({ kind: "success", videoUrl: url });
            if (interval) clearInterval(interval);
            interval = null;
            return;
          }

          setVideoStatus({
            kind: "error",
            message: json.data.errorMessage || `Video failed: ${String(s)}`,
          });
          if (interval) clearInterval(interval);
          interval = null;
        } else {
          const res = await fetch(
            `/api/kling/status?taskId=${encodeURIComponent(currentTaskId)}`,
            { method: "GET", cache: "no-store" },
          );
          const json = (await res.json()) as {
            data?: {
              status?: string;
              response?: string[];
              error_message?: string | null;
            };
            error?: string;
          };
          if (!res.ok || !json.data) throw new Error(json.error || "Polling failed.");
          if (cancelled) return;

          const s = json.data.status ?? "IN_PROGRESS";
          if (s === "IN_PROGRESS") {
            setVideoStatus({ kind: "generating", providerStatus: s });
            return;
          }
          if (s === "SUCCESS") {
            const url = json.data.response?.[0];
            if (!url) throw new Error("Video succeeded but response[0] is missing.");
            setVideoStatus({ kind: "success", videoUrl: url });
            if (interval) clearInterval(interval);
            interval = null;
            return;
          }

          setVideoStatus({
            kind: "error",
            message: json.data.error_message || `Video failed: ${s}`,
          });
          if (interval) clearInterval(interval);
          interval = null;
        }
      } catch (err) {
        if (cancelled) return;
        setVideoStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Unknown error.",
        });
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
  }, [videoTaskId]);

  async function onGenerateTextVideo() {
    const p = textVideoPrompt.trim();
    if (!p) {
      toast.error(lang === "fr" ? "Ajoute un prompt vidéo." : "Enter a video prompt.");
      return;
    }

    setIsTextVideoSubmitting(true);
    setTextVideoTaskId(null);
    setTextVideoStatus({ kind: "generating" });

    try {
      const res =
        textVideoProvider === "kie"
          ? await fetch("/api/kie/veo/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: p,
                model: textVideoModel,
                aspectRatio: textVideoAspectRatio,
                enableTranslation: textVideoEnableTranslation,
              }),
            })
          : await fetch("/api/kling/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: klingTextType,
                prompt: p,
                duration: klingTextDuration,
                aspectRatio: klingTextAspectRatio,
                sound: klingTextSound,
              }),
            });

      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) {
        throw new Error(json.error || "Video generate request failed.");
      }

      setTextVideoTaskId(json.taskId);
      setTextVideoTaskProvider(textVideoProvider);
      toast.success(lang === "fr" ? "Vidéo (text) lancée" : "Text video started", {
        description: json.taskId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setTextVideoStatus({ kind: "error", message });
      toast.error(lang === "fr" ? "Erreur vidéo" : "Video error", {
        description: message,
      });
    } finally {
      setIsTextVideoSubmitting(false);
    }
  }

  useEffect(() => {
    if (!textVideoTaskId) return;
    const currentTaskId = textVideoTaskId;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        if (textVideoTaskProvider === "kie") {
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
          if (!res.ok || !json.data) throw new Error(json.error || "Polling failed.");
          if (cancelled) return;

          const s = json.data.successFlag ?? 0;
          if (s === 0) {
            setTextVideoStatus({ kind: "generating", providerStatus: "GENERATING" });
            return;
          }
          if (s === 1) {
            const url = json.data.response?.resultUrls?.[0];
            if (!url) throw new Error("Video succeeded but resultUrls[0] is missing.");
            setTextVideoStatus({ kind: "success", videoUrl: url });
            if (interval) clearInterval(interval);
            interval = null;
            return;
          }

          setTextVideoStatus({
            kind: "error",
            message: json.data.errorMessage || `Video failed: ${String(s)}`,
          });
          if (interval) clearInterval(interval);
          interval = null;
        } else {
          const res = await fetch(
            `/api/kling/status?taskId=${encodeURIComponent(currentTaskId)}`,
            { method: "GET", cache: "no-store" },
          );
          const json = (await res.json()) as {
            data?: {
              status?: string;
              response?: string[];
              error_message?: string | null;
            };
            error?: string;
          };
          if (!res.ok || !json.data) throw new Error(json.error || "Polling failed.");
          if (cancelled) return;

          const s = json.data.status ?? "IN_PROGRESS";
          if (s === "IN_PROGRESS") {
            setTextVideoStatus({ kind: "generating", providerStatus: s });
            return;
          }
          if (s === "SUCCESS") {
            const url = json.data.response?.[0];
            if (!url) throw new Error("Video succeeded but response[0] is missing.");
            setTextVideoStatus({ kind: "success", videoUrl: url });
            if (interval) clearInterval(interval);
            interval = null;
            return;
          }

          setTextVideoStatus({
            kind: "error",
            message: json.data.error_message || `Video failed: ${s}`,
          });
          if (interval) clearInterval(interval);
          interval = null;
        }
      } catch (err) {
        if (cancelled) return;
        setTextVideoStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Unknown error.",
        });
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
  }, [textVideoTaskId]);

  function onReset() {
    setPrompt("");
    setFiles([]);
    setNanoModel("nano");
    setProResolution("2K");
    setNumImages(1);
    setTaskId(null);
    setStatus({ kind: "idle" });
    setVideoTaskId(null);
    setVideoStatus({ kind: "idle" });
    setVideoProvider("kie");
    setVideoTaskProvider("kie");
    setVideoSource("generated");
    setVideoUploadFile(null);
    setVideoUploadUrl(null);
    setVideoModel("veo3_fast");
    setVideoAspectRatio("9:16");
    setVideoEnableTranslation(true);
    setKlingImageType("pro");
    setKlingImageDuration(10);
    setKlingImageAspectRatio("9:16");
    setKlingImageSound(false);
    setTextVideoTaskId(null);
    setTextVideoStatus({ kind: "idle" });
    setTextVideoProvider("kie");
    setTextVideoTaskProvider("kie");
    setTextVideoModel("veo3_fast");
    setTextVideoAspectRatio("9:16");
    setTextVideoEnableTranslation(true);
    setKlingTextType("pro");
    setKlingTextDuration(10);
    setKlingTextAspectRatio("9:16");
    setKlingTextSound(false);
    setSelectedImageForVideo(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>

        <Separator className="my-6" />

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>{lang === "fr" ? "Modèle image" : "Image model"}</Label>
                <Select
                  value={nanoModel}
                  onValueChange={(v) => setNanoModel(v as "nano" | "pro")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nano">NanoBanana</SelectItem>
                    <SelectItem value="pro">NanoBanana Pro</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      const imageUrls =
                        files.length > 0 ? await Promise.all(files.map(uploadOne)) : [];
                      const res = await fetch("/api/nanobanana/preview", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          model: nanoModel,
                          prompt,
                          imageUrls,
                          numImages,
                          imageSize,
                          resolution: proResolution,
                        }),
                      });
                      const json = await res.json();
                      toast.info(lang === "fr" ? "Preview mapping image" : "Image mapping preview", {
                        description: JSON.stringify(json).slice(0, 240) + "…",
                      });
                    }}
                  >
                    {lang === "fr" ? "Test mapping" : "Test mapping"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t.language}</Label>
                <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prompt">{t.prompt}</Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={8}
                  placeholder={
                    lang === "fr"
                      ? "Ex: Photo ultra réaliste d’une personne tenant le produit, lumière studio, fond lifestyle, rendu UGC..."
                      : "Ex: Ultra realistic photo of a person holding the product, studio lighting, lifestyle background, UGC look..."
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>{t.productImage}</Label>
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) =>
                    setFiles(e.target.files ? Array.from(e.target.files) : [])
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {lang === "fr"
                    ? "Si tu upload une ou plusieurs images, on utilise IMAGETOIAMGE (édition multi-images). Sinon, TEXTTOIAMGE (génération)."
                    : "If you upload one or more images, we use IMAGETOIAMGE (multi-image edit). Otherwise, TEXTTOIAMGE (generate)."}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{lang === "fr" ? "Nombre d'images à générer" : "Number of images to generate"}</Label>
                <Select
                  value={String(numImages)}
                  onValueChange={(v) => setNumImages(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {nanoModel === "pro" && (
                  <p className="text-xs text-muted-foreground">
                    {lang === "fr"
                      ? "NanoBanana Pro ne supporte pas numImages (batch) comme l’API standard: on génère 1 image par tâche."
                      : "NanoBanana Pro doesn't use numImages like the standard API: 1 image per task."}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t.aspectRatio}</Label>
                <Select
                  value={imageSize}
                  onValueChange={(v) => setImageSize(v as NanoBananaImageSize)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_SIZES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {nanoModel === "pro" && (
                <div className="space-y-2">
                  <Label>{lang === "fr" ? "Résolution (Pro)" : "Resolution (Pro)"}</Label>
                  <Select
                    value={proResolution}
                    onValueChange={(v) => setProResolution(v as NanoBananaProResolution)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1K">1K</SelectItem>
                      <SelectItem value="2K">2K</SelectItem>
                      <SelectItem value="4K">4K</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={onGenerate} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {lang === "fr" ? "Génération…" : "Generating…"}
                    </span>
                  ) : (
                    t.generate
                  )}
                </Button>
                <Button variant="secondary" onClick={onReset} disabled={isSubmitting}>
                  {t.reset}
                </Button>
              </div>

              <div className="rounded-md border p-3">
                <div className="text-sm font-medium">{t.noteTitle}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.note}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.result}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {t.task}: {taskId ?? (lang === "fr" ? "—" : "—")}
                </Badge>
                {status.kind === "idle" && <Badge variant="outline">IDLE</Badge>}
                {status.kind === "generating" && (
                  <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                    GENERATING
                  </Badge>
                )}
                {status.kind === "success" && (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    SUCCESS
                  </Badge>
                )}
                {status.kind === "error" && (
                  <Badge className="bg-red-600 text-white hover:bg-red-600">ERROR</Badge>
                )}
              </div>

              {previewUrls.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {lang === "fr" ? "Aperçu produit" : "Product preview"}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {previewUrls.map((u) => (
                      <img
                        key={u}
                        src={u}
                        alt="Product preview"
                        className="h-40 w-full rounded-md border object-contain"
                      />
                    ))}
                  </div>
                </div>
              )}

              {status.kind === "error" && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  {status.message}
                </div>
              )}

              {status.kind === "success" && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">{lang === "fr" ? "Image générée" : "Generated image"}</div>
                  <div className="grid gap-2">
                    {status.resultImageUrls.map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground underline"
                      >
                        {u}
                      </a>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {status.resultImageUrls.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setSelectedImageForVideo(u)}
                        className={`rounded-md border p-1 text-left ${
                          selectedImageForVideo === u ? "border-primary" : ""
                        }`}
                        title={lang === "fr" ? "Utiliser pour la vidéo" : "Use for video"}
                      >
                        <img
                          src={u}
                          alt="Generated result"
                          className="h-40 w-full rounded-md object-contain"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Separator className="my-6" />

        <Card>
          <CardHeader>
            <CardTitle>{lang === "fr" ? "Vidéo UGC (à partir de l’image)" : "UGC Video (from the image)"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{lang === "fr" ? "Fournisseur" : "Provider"}</Label>
                  <Select
                    value={videoProvider}
                    onValueChange={(v) => setVideoProvider(v as VideoProvider)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kie">KIE (Veo 3.1)</SelectItem>
                      <SelectItem value="kling">Kling 3.0</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{lang === "fr" ? "Source image" : "Image source"}</Label>
                  <Select
                    value={videoSource}
                    onValueChange={(v) => {
                      const next = v as VideoSource;
                      setVideoSource(next);
                      // Reset uploaded url when switching
                      setVideoUploadUrl(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="generated">
                        {lang === "fr" ? "Image générée (NanoBanana)" : "Generated image (NanoBanana)"}
                      </SelectItem>
                      <SelectItem value="upload">
                        {lang === "fr" ? "Upload une image" : "Upload an image"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {videoSource === "upload" && (
                  <div className="space-y-2">
                    <Label>{lang === "fr" ? "Image à uploader" : "Image to upload"}</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setVideoUploadFile(f);
                        setVideoUploadUrl(null);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {lang === "fr"
                        ? "L’image sera uploadée automatiquement au moment de générer la vidéo."
                        : "The image will be uploaded automatically when generating the video."}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>
                    {lang === "fr" ? "Modèle" : "Model"}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({videoProvider === "kie" ? "KIE Veo 3.1" : "Kling 3.0"})
                    </span>
                  </Label>
                  {videoProvider === "kie" ? (
                    <Select
                      value={videoModel}
                      onValueChange={(v) => setVideoModel(v as KieVeoModel)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VEO_MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={klingImageType}
                      onValueChange={(v) => setKlingImageType(v as KlingMode)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KLING_MODES.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{lang === "fr" ? "Format" : "Aspect ratio"}</Label>
                    {videoProvider === "kie" ? (
                      <Select
                        value={videoAspectRatio}
                        onValueChange={(v) =>
                          setVideoAspectRatio(v as KieVeoAspectRatio)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VEO_RATIOS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={klingImageAspectRatio}
                        onValueChange={(v) =>
                          setKlingImageAspectRatio(v as KlingAspectRatio)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KLING_RATIOS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {videoProvider === "kie" ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={videoEnableTranslation ? "default" : "secondary"}
                      onClick={() => setVideoEnableTranslation((v) => !v)}
                    >
                      {lang === "fr"
                        ? videoEnableTranslation
                          ? "Traduction ON"
                          : "Traduction OFF"
                        : videoEnableTranslation
                          ? "Translation ON"
                          : "Translation OFF"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {lang === "fr"
                        ? "KIE peut traduire automatiquement le prompt en anglais."
                        : "KIE can auto-translate prompts to English."}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{lang === "fr" ? "Durée" : "Duration"}</Label>
                      <Select
                        value={String(klingImageDuration)}
                        onValueChange={(v) => setKlingImageDuration(Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 13 }, (_, i) => i + 3).map((d) => (
                            <SelectItem key={d} value={String(d)}>
                              {d}s
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{lang === "fr" ? "Audio" : "Audio"}</Label>
                      <Button
                        type="button"
                        variant={klingImageSound ? "default" : "secondary"}
                        onClick={() => setKlingImageSound((v) => !v)}
                        className="w-full"
                      >
                        {klingImageSound
                          ? lang === "fr"
                            ? "Audio ON"
                            : "Audio ON"
                          : lang === "fr"
                            ? "Audio OFF"
                            : "Audio OFF"}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="videoPrompt">{lang === "fr" ? "Prompt vidéo" : "Video prompt"}</Label>
                  <Textarea
                    id="videoPrompt"
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    rows={5}
                    placeholder={
                      lang === "fr"
                        ? "Ex: La personne tourne le produit, sourire naturel, caméra handheld, style UGC TikTok..."
                        : "Ex: Person rotates the product, natural smile, handheld camera, TikTok UGC style..."
                    }
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={onGenerateVideo} disabled={isVideoSubmitting}>
                    {isVideoSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {lang === "fr" ? "Génération…" : "Generating…"}
                      </span>
                    ) : lang === "fr" ? (
                      "Générer la vidéo"
                    ) : (
                      "Generate video"
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setVideoTaskId(null);
                      setVideoStatus({ kind: "idle" });
                    }}
                    disabled={isVideoSubmitting}
                  >
                    {lang === "fr" ? "Reset vidéo" : "Reset video"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      const sourceUrl =
                        videoSource === "generated"
                          ? generatedImageUrl
                          : await ensureVideoUploadUrl();

                      const res =
                        videoProvider === "kie"
                          ? await fetch("/api/kie/veo/preview", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                prompt: videoPrompt || prompt,
                                model: videoModel,
                                aspectRatio: videoAspectRatio,
                                enableTranslation: videoEnableTranslation,
                                generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
                                imageUrls: sourceUrl ? [sourceUrl] : [],
                              }),
                            })
                          : await fetch("/api/kling/preview", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                mode: klingImageType,
                                prompt: videoPrompt || prompt,
                                imageUrl: sourceUrl ?? undefined,
                                duration: klingImageDuration,
                                aspectRatio: klingImageAspectRatio,
                                sound: klingImageSound,
                              }),
                            });
                      const json = await res.json();
                      toast.info(lang === "fr" ? "Preview mapping vidéo" : "Video mapping preview", {
                        description: JSON.stringify(json).slice(0, 240) + "…",
                      });
                    }}
                  >
                    {lang === "fr" ? "Test mapping" : "Test mapping"}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">task: {videoTaskId ?? "—"}</Badge>
                  {videoStatus.kind === "idle" && <Badge variant="outline">IDLE</Badge>}
                  {videoStatus.kind === "generating" && (
                    <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                      {videoStatus.providerStatus ?? "IN_PROGRESS"}
                    </Badge>
                  )}
                  {videoStatus.kind === "success" && (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                      SUCCESS
                    </Badge>
                  )}
                  {videoStatus.kind === "error" && (
                    <Badge className="bg-red-600 text-white hover:bg-red-600">ERROR</Badge>
                  )}
                </div>

                {videoStatus.kind === "error" && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    {videoStatus.message}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {lang === "fr" ? "Image source" : "Source image"}
                  </div>
                  {videoSource === "generated" ? (
                    generatedImageUrl ? (
                      <img
                        src={generatedImageUrl}
                        alt="Source for video"
                        className="w-full rounded-md border object-contain"
                      />
                    ) : (
                      <div className="rounded-md border p-4 text-sm text-muted-foreground">
                        {lang === "fr"
                          ? "Sélectionne une image générée (en haut)."
                          : "Select a generated image above."}
                      </div>
                    )
                  ) : videoUploadPreviewUrl ? (
                    <img
                      src={videoUploadPreviewUrl}
                      alt="Uploaded source"
                      className="w-full rounded-md border object-contain"
                    />
                  ) : (
                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                      {lang === "fr"
                        ? "Upload une image pour générer la vidéo."
                        : "Upload an image to generate the video."}
                    </div>
                  )}
                </div>

                {videoStatus.kind === "success" && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {lang === "fr" ? "Vidéo générée" : "Generated video"}
                    </div>
                    <a
                      href={videoStatus.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline"
                    >
                      {videoStatus.videoUrl}
                    </a>
                    <video
                      src={videoStatus.videoUrl}
                      controls
                      className="w-full rounded-md border"
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        <Card>
          <CardHeader>
            <CardTitle>
              {lang === "fr" ? "Text → Vidéo UGC" : "Text → UGC Video"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{lang === "fr" ? "Fournisseur" : "Provider"}</Label>
                  <Select
                    value={textVideoProvider}
                    onValueChange={(v) => setTextVideoProvider(v as VideoProvider)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kie">KIE (Veo 3.1)</SelectItem>
                      <SelectItem value="kling">Kling 3.0</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>
                    {lang === "fr" ? "Modèle" : "Model"}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({textVideoProvider === "kie" ? "KIE Veo 3.1" : "Kling 3.0"})
                    </span>
                  </Label>
                  {textVideoProvider === "kie" ? (
                    <Select
                      value={textVideoModel}
                      onValueChange={(v) => setTextVideoModel(v as KieVeoModel)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="veo3_fast">Veo 3.1 Fast</SelectItem>
                        <SelectItem value="veo3">Veo 3.1 Quality</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={klingTextType}
                      onValueChange={(v) => setKlingTextType(v as KlingMode)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KLING_MODES.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{lang === "fr" ? "Format" : "Aspect ratio"}</Label>
                    {textVideoProvider === "kie" ? (
                      <Select
                        value={textVideoAspectRatio}
                        onValueChange={(v) =>
                          setTextVideoAspectRatio(v as KieVeoAspectRatio)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="16:9">16:9</SelectItem>
                          <SelectItem value="9:16">9:16</SelectItem>
                          <SelectItem value="Auto">Auto</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={klingTextAspectRatio}
                        onValueChange={(v) =>
                          setKlingTextAspectRatio(v as KlingAspectRatio)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KLING_RATIOS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {textVideoProvider === "kie" ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={textVideoEnableTranslation ? "default" : "secondary"}
                      onClick={() => setTextVideoEnableTranslation((v) => !v)}
                    >
                      {lang === "fr"
                        ? textVideoEnableTranslation
                          ? "Traduction ON"
                          : "Traduction OFF"
                        : textVideoEnableTranslation
                          ? "Translation ON"
                          : "Translation OFF"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {lang === "fr"
                        ? "KIE peut traduire automatiquement le prompt en anglais."
                        : "KIE can auto-translate prompts to English."}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{lang === "fr" ? "Durée" : "Duration"}</Label>
                      <Select
                        value={String(klingTextDuration)}
                        onValueChange={(v) => setKlingTextDuration(Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 13 }, (_, i) => i + 3).map((d) => (
                            <SelectItem key={d} value={String(d)}>
                              {d}s
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{lang === "fr" ? "Audio" : "Audio"}</Label>
                      <Button
                        type="button"
                        variant={klingTextSound ? "default" : "secondary"}
                        onClick={() => setKlingTextSound((v) => !v)}
                        className="w-full"
                      >
                        {klingTextSound ? "Audio ON" : "Audio OFF"}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="textVideoPrompt">
                    {lang === "fr" ? "Prompt vidéo" : "Video prompt"}
                  </Label>
                  <Textarea
                    id="textVideoPrompt"
                    value={textVideoPrompt}
                    onChange={(e) => setTextVideoPrompt(e.target.value)}
                    rows={6}
                    placeholder={
                      lang === "fr"
                        ? "Ex: Une créatrice filme un unboxing du produit, caméra smartphone, style TikTok UGC, lumière naturelle..."
                        : "Ex: A creator films a product unboxing, smartphone camera, TikTok UGC style, natural light..."
                    }
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={onGenerateTextVideo}
                    disabled={isTextVideoSubmitting}
                  >
                    {isTextVideoSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {lang === "fr" ? "Génération…" : "Generating…"}
                      </span>
                    ) : lang === "fr" ? (
                      "Générer la vidéo"
                    ) : (
                      "Generate video"
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTextVideoTaskId(null);
                      setTextVideoStatus({ kind: "idle" });
                    }}
                    disabled={isTextVideoSubmitting}
                  >
                    {lang === "fr" ? "Reset" : "Reset"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      const res =
                        textVideoProvider === "kie"
                          ? await fetch("/api/kie/veo/preview", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                aspectRatio: textVideoAspectRatio,
                                model: textVideoModel,
                                enableTranslation: textVideoEnableTranslation,
                                prompt: textVideoPrompt,
                              }),
                            })
                          : await fetch("/api/kling/preview", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                mode: klingTextType,
                                prompt: textVideoPrompt,
                                duration: klingTextDuration,
                                aspectRatio: klingTextAspectRatio,
                                sound: klingTextSound,
                              }),
                            });
                      const json = await res.json();
                      toast.info(lang === "fr" ? "Preview mapping vidéo" : "Video mapping preview", {
                        description: JSON.stringify(json).slice(0, 240) + "…",
                      });
                    }}
                  >
                    {lang === "fr" ? "Test mapping" : "Test mapping"}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">task: {textVideoTaskId ?? "—"}</Badge>
                  {textVideoStatus.kind === "idle" && (
                    <Badge variant="outline">IDLE</Badge>
                  )}
                  {textVideoStatus.kind === "generating" && (
                    <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                      {textVideoStatus.providerStatus ?? "IN_PROGRESS"}
                    </Badge>
                  )}
                  {textVideoStatus.kind === "success" && (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                      SUCCESS
                    </Badge>
                  )}
                  {textVideoStatus.kind === "error" && (
                    <Badge className="bg-red-600 text-white hover:bg-red-600">
                      ERROR
                    </Badge>
                  )}
                </div>

                {textVideoStatus.kind === "error" && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    {textVideoStatus.message}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {textVideoStatus.kind === "success" && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {lang === "fr" ? "Vidéo générée" : "Generated video"}
                    </div>
                    <a
                      href={textVideoStatus.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline"
                    >
                      {textVideoStatus.videoUrl}
                    </a>
                    <video
                      src={textVideoStatus.videoUrl}
                      controls
                      className="w-full rounded-md border"
                    />
                  </div>
                )}
                {textVideoStatus.kind !== "success" && (
                  <div className="rounded-md border p-4 text-sm text-muted-foreground">
                    {lang === "fr"
                      ? "Lance une génération pour afficher la vidéo ici."
                      : "Start a generation to display the video here."}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
