"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type WizardStep = "url" | "analysis" | "quiz" | "image" | "video";

type Extracted = {
  url: string;
  canonical: string | null;
  title: string | null;
  description: string | null;
  images: string[];
  excerpt: string;
  snippets: string[];
  signals: { prices: string[]; textLength: number };
  structured?: { jsonLdProducts?: any[] };
};

type AnalyzeResult = any;

type Quiz = {
  aboutProduct: string;
  problems: string;
  promises: string;
  persona: string;
  angles: string;
  offers: string;
  videoDurationPreference: "15s" | "20s" | "30s";
};

type NanoModel = "nano" | "pro";

type ImageGenState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "polling"; taskId: string }
  | { kind: "success"; urls: string[] }
  | { kind: "error"; message: string };

type VideoGenState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "polling"; taskId: string }
  | { kind: "success"; url: string }
  | { kind: "error"; message: string };

const TEMPLATES = [
  {
    id: "template1",
    title: "Template 1 — UGC Smartphone authentique (POV/Selfie)",
    bestFor: "beauté / boisson / food / fashion / gadget",
  },
  {
    id: "template2",
    title: "Template 2 — Beauty/Wellness cinematic UGC",
    bestFor: "skincare / makeup / supplement / self-care",
  },
  {
    id: "template3",
    title: "Template 3 — Storytelling problem-solution UGC",
    bestFor: "gadget / douleur / complément / niche émotionnelle",
  },
] as const;

type TemplateId = (typeof TEMPLATES)[number]["id"];

function safeString(x: unknown, fallback = ""): string {
  return typeof x === "string" ? x : fallback;
}

export default function AppBrandWizard() {
  const [step, setStep] = useState<WizardStep>("url");

  const [storeUrl, setStoreUrl] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [researchNotes, setResearchNotes] = useState<string[]>([]);

  const [quiz, setQuiz] = useState<Quiz>({
    aboutProduct: "",
    problems: "",
    promises: "",
    persona: "",
    angles: "",
    offers: "",
    videoDurationPreference: "15s",
  });
  const [quizPrecisionNote, setQuizPrecisionNote] = useState<string>("");
  const [isQuizAutofilling, setIsQuizAutofilling] = useState(false);

  const [isClassifyingImages, setIsClassifyingImages] = useState(false);
  const [productOnlyCandidates, setProductOnlyCandidates] = useState<
    Array<{ url: string; reason?: string }>
  >([]);
  const [selectedProductImageUrls, setSelectedProductImageUrls] = useState<string[]>([]);

  const [nanoModel, setNanoModel] = useState<NanoModel>("nano");
  const [imagePrompt, setImagePrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [imageGen, setImageGen] = useState<ImageGenState>({ kind: "idle" });
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("template1");
  const [videoPrompt, setVideoPrompt] = useState<string>("");
  const [videoGen, setVideoGen] = useState<VideoGenState>({ kind: "idle" });

  const currentProductName = useMemo(() => {
    const fromAnalysis = safeString(analysis?.step1_rawSheet ?? "");
    if (extracted?.title) return extracted.title;
    if (fromAnalysis) return fromAnalysis.split("\n")[0]?.slice(0, 120) ?? null;
    return null;
  }, [analysis, extracted?.title]);

  async function onExtract() {
    const url = storeUrl.trim();
    if (!url) {
      toast.error("Colle l’URL d’un store / page produit.");
      return;
    }

    setIsExtracting(true);
    setExtracted(null);
    setAnalysis(null);
    setResearchNotes([]);

    try {
      const res = await fetch("/api/store/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as { error?: string } & Partial<Extracted>;
      if (!res.ok) throw new Error(json.error || "Extract failed");
      setExtracted(json as Extracted);
      setStep("analysis");
      toast.success("Extraction OK");
    } catch (err) {
      toast.error("Extraction error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsExtracting(false);
    }
  }

  async function onAnalyze() {
    if (!extracted) return;
    setIsAnalyzing(true);
    setAnalysis(null);
    setResearchNotes([]);

    try {
      const res = await fetch("/api/gpt/brand-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extracted),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Analyze failed");
      setAnalysis(json.data);

      const rn = json.data?.researchNotes;
      if (Array.isArray(rn)) setResearchNotes(rn.map((x: any) => String(x)));

      const pre = json.data?.quizPrefill ?? {};
      setQuiz((q) => ({
        ...q,
        aboutProduct: safeString(pre.aboutProduct, q.aboutProduct),
        problems: safeString(pre.problems, q.problems),
        promises: safeString(pre.promises, q.promises),
        persona: safeString(pre.persona, q.persona),
        angles: safeString(pre.angles, q.angles),
        offers: safeString(pre.offers, q.offers),
        videoDurationPreference:
          pre.videoDurationPreference === "20s" || pre.videoDurationPreference === "30s"
            ? pre.videoDurationPreference
            : "15s",
      }));

      setStep("quiz");
      toast.success("Analyse OK");
    } catch (err) {
      toast.error("Analyse error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function onAutoFillQuiz() {
    if (!extracted) return;
    setIsQuizAutofilling(true);
    setQuizPrecisionNote("");
    try {
      const res = await fetch("/api/gpt/quiz-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: extracted.url,
          title: extracted.title,
          description: extracted.description,
          snippets: extracted.snippets,
          signals: extracted.signals,
          excerpt: extracted.excerpt,
        }),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Autofill failed");
      setQuiz((q) => ({
        ...q,
        aboutProduct: String(json.data.aboutProduct ?? q.aboutProduct),
        problems: String(json.data.problems ?? q.problems),
        promises: String(json.data.promises ?? q.promises),
        persona: String(json.data.persona ?? q.persona),
        angles: String(json.data.angles ?? q.angles),
        offers: String(json.data.offers ?? q.offers),
        videoDurationPreference:
          json.data.videoDurationPreference === "20s" || json.data.videoDurationPreference === "30s"
            ? json.data.videoDurationPreference
            : "15s",
      }));
      setQuizPrecisionNote(
        String(
          json.data.precisionNote ??
            "Auto-fill from URL is helpful, but it will be more precise if you write it yourself.",
        ),
      );
      toast.success("Quiz auto-rempli");
    } catch (err) {
      toast.error("Quiz autofill error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsQuizAutofilling(false);
    }
  }

  async function onFindProductOnlyImages() {
    if (!extracted?.images?.length) return;
    setIsClassifyingImages(true);
    setProductOnlyCandidates([]);
    setSelectedProductImageUrls([]);
    try {
      const res = await fetch("/api/gpt/images-classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl: extracted.url,
          imageUrls: extracted.images,
        }),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Image classify failed");
      const candidates = Array.isArray(json.data.productOnlyUrls) ? json.data.productOnlyUrls : [];
      setProductOnlyCandidates(
        candidates
          .filter((x: any) => typeof x?.url === "string")
          .map((x: any) => ({ url: String(x.url), reason: x.reason ? String(x.reason) : undefined })),
      );
      const defaults = candidates
        .filter((x: any) => typeof x?.url === "string")
        .slice(0, 2)
        .map((x: any) => String(x.url));
      setSelectedProductImageUrls(defaults);
      toast.success("Images produit seul détectées");
    } catch (err) {
      toast.error("Image classify error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsClassifyingImages(false);
    }
  }

  async function copyToClipboard(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch (err) {
      toast.error("Copy failed", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  async function onGenerateImagePrompt() {
    if (!extracted || !analysis) return;
    try {
      const res = await fetch("/api/gpt/image-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: extracted.url,
          analysis,
          productName: extracted.title,
          productImages: extracted.images,
          quiz: { persona: quiz.persona, videoDurationPreference: quiz.videoDurationPreference },
        }),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Image prompt failed");
      setImagePrompt(String(json.data.imagePrompt ?? ""));
      setNegativePrompt(String(json.data.negativePrompt ?? ""));
      toast.success("Image prompt prêt");
    } catch (err) {
      toast.error("Image prompt error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function onGenerateImage() {
    if (!extracted) return;
    if (!imagePrompt.trim()) {
      toast.error("Génère le prompt image d’abord.");
      return;
    }

    setImageGen({ kind: "submitting" });
    setSelectedImageUrl(null);

    try {
      const res = await fetch("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: nanoModel,
          prompt: imagePrompt,
          imageUrls:
            selectedProductImageUrls.length > 0
              ? selectedProductImageUrls.slice(0, 2)
              : extracted.images.slice(0, 2),
          numImages: 1,
          aspectRatio: "9:16",
          resolution: "2K",
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "NanoBanana generate failed");
      setImageGen({ kind: "polling", taskId: json.taskId });
      toast.success("Image task créée", { description: json.taskId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setImageGen({ kind: "error", message });
      toast.error("Image error", { description: message });
    }
  }

  useEffect(() => {
    if (imageGen.kind !== "polling") return;
    const taskId = imageGen.taskId;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json()) as any;
        if (!res.ok || !json.data) throw new Error(json.error || "Polling failed");
        if (cancelled) return;

        const s = json.data.successFlag ?? 0;
        if (s === 0) return;
        if (s === 1) {
          const urls = (Array.isArray(json.data.response?.resultUrls)
            ? json.data.response.resultUrls
            : []) as string[];
          if (!urls?.length) throw new Error("Image succeeded but resultUrls missing.");
          setImageGen({ kind: "success", urls });
          setSelectedImageUrl(urls[0]);
          if (interval) clearInterval(interval);
          interval = null;
          return;
        }
        throw new Error(json.data.errorMessage || `Image failed: ${String(s)}`);
      } catch (err) {
        if (cancelled) return;
        setImageGen({ kind: "error", message: err instanceof Error ? err.message : "Unknown error." });
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
  }, [imageGen]);

  async function onBuildVideoPrompt() {
    if (!extracted || !analysis) return;
    if (!selectedImageUrl) {
      toast.error("Sélectionne d’abord l’image générée.");
      return;
    }

    try {
      const res = await fetch("/api/gpt/video-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: extracted.url,
          analysis,
          quiz,
          templateId: selectedTemplate,
          productName: extracted.title,
        }),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Template fill failed");
      setVideoPrompt(String(json.data.filledPrompt ?? ""));
      toast.success("Template rempli");
    } catch (err) {
      toast.error("Template error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function onGenerateVideo() {
    if (!selectedImageUrl) return;
    if (!videoPrompt.trim()) {
      toast.error("Génère le prompt vidéo (template) d’abord.");
      return;
    }

    setVideoGen({ kind: "submitting" });
    try {
      // Force Kling 3.0 Standard per user request. Kling supports up to 15s.
      const duration =
        quiz.videoDurationPreference === "15s"
          ? 15
          : quiz.videoDurationPreference === "20s"
            ? 15
            : 15;
      const res = await fetch("/api/kling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketModel: "kling-3.0/video",
          prompt: videoPrompt,
          imageUrl: selectedImageUrl,
          duration,
          mode: "std",
          sound: false,
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Video generate failed");
      setVideoGen({ kind: "polling", taskId: json.taskId });
      toast.success("Vidéo task créée", { description: json.taskId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setVideoGen({ kind: "error", message });
      toast.error("Video error", { description: message });
    }
  }

  useEffect(() => {
    if (videoGen.kind !== "polling") return;
    const taskId = videoGen.taskId;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json()) as any;
        if (!res.ok || !json.data) throw new Error(json.error || "Polling failed");
        if (cancelled) return;

        const s = json.data.status ?? "IN_PROGRESS";
        if (s === "IN_PROGRESS") return;
        if (s === "SUCCESS") {
          const url = json.data.response?.[0];
          if (!url) throw new Error("Video succeeded but response[0] missing.");
          setVideoGen({ kind: "success", url });
          if (interval) clearInterval(interval);
          interval = null;
          return;
        }
        throw new Error(json.data.error_message || `Video failed: ${String(s)}`);
      } catch (err) {
        if (cancelled) return;
        setVideoGen({ kind: "error", message: err instanceof Error ? err.message : "Unknown error." });
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
  }, [videoGen]);

  const videoDownloadHref = useMemo(() => {
    if (videoGen.kind !== "success") return null;
    return `/api/download?url=${encodeURIComponent(videoGen.url)}`;
  }, [videoGen]);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">UGC Factory — Brand Analyzer → Image → Video</h1>
          <p className="text-sm text-muted-foreground">
            Colle l’URL du store, on analyse (étapes 1→9), mini quiz, puis génération image NanoBanana et vidéo UGC.
          </p>
        </div>

        <Separator className="my-6" />

        <div className="grid gap-6 md:grid-cols-[420px_1fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Store URL</Label>
                <Input
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  placeholder="https://..."
                />
                <div className="flex gap-2">
                  <Button onClick={onExtract} disabled={isExtracting}>
                    {isExtracting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Extract
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={onAnalyze}
                    disabled={!extracted || isAnalyzing}
                  >
                    {isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Run GPT analysis (1→9)
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">step: {step}</Badge>
                {extracted?.title && <Badge variant="outline">{extracted.title.slice(0, 42)}</Badge>}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Mini quiz</Label>
                <p className="text-xs text-muted-foreground">
                  Certaines réponses sont pré-remplies depuis l’analyse pour économiser des tokens.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={onAutoFillQuiz}
                    disabled={!extracted || isQuizAutofilling}
                  >
                    {isQuizAutofilling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Auto-répondre (depuis l’URL)
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {quizPrecisionNote ||
                    "Auto-répondre aide à démarrer, mais ce sera plus précis si vous le rentrez vous-même."}
                </p>
                <Textarea
                  value={quiz.aboutProduct}
                  onChange={(e) => setQuiz((q) => ({ ...q, aboutProduct: e.target.value }))}
                  rows={4}
                  placeholder="1) Parle-nous de ton produit..."
                />
                <Textarea
                  value={quiz.problems}
                  onChange={(e) => setQuiz((q) => ({ ...q, problems: e.target.value }))}
                  rows={3}
                  placeholder="2) Quel(s) problème(s) ton produit résout ?"
                />
                <Textarea
                  value={quiz.promises}
                  onChange={(e) => setQuiz((q) => ({ ...q, promises: e.target.value }))}
                  rows={3}
                  placeholder="3) Quelles sont ses promesses principales ?"
                />
                <Textarea
                  value={quiz.persona}
                  onChange={(e) => setQuiz((q) => ({ ...q, persona: e.target.value }))}
                  rows={4}
                  placeholder="4) Décris ton persona type (âge, situation, désir...)"
                />
                <Textarea
                  value={quiz.angles}
                  onChange={(e) => setQuiz((q) => ({ ...q, angles: e.target.value }))}
                  rows={3}
                  placeholder="5) Tes principaux angles marketing ?"
                />
                <Textarea
                  value={quiz.offers}
                  onChange={(e) => setQuiz((q) => ({ ...q, offers: e.target.value }))}
                  rows={3}
                  placeholder="6) Tes offres actuelles (promo, bundle, garantie, livraison...)"
                />
                <div className="space-y-2">
                  <Label>7) Durée souhaitée vidéos</Label>
                  <Select
                    value={quiz.videoDurationPreference}
                    onValueChange={(v) =>
                      setQuiz((q) => ({
                        ...q,
                        videoDurationPreference:
                          v === "20s" || v === "30s" ? v : "15s",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15s">15s</SelectItem>
                      <SelectItem value="20s">20s</SelectItem>
                      <SelectItem value="30s">30s</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Note: Veo 3.1 sort ~8s par clip. Pour 15/20/30s, il faut enchaîner plusieurs clips ou utiliser “extend”.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep("image");
                  }}
                  disabled={!analysis}
                >
                  Next → Image
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setStep("video")}
                  disabled={!selectedImageUrl}
                >
                  Next → Video
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Image generation</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={onFindProductOnlyImages}
                    disabled={!extracted?.images?.length || isClassifyingImages}
                  >
                    {isClassifyingImages && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Trouver images “produit seul” (AI)
                  </Button>
                </div>
                {productOnlyCandidates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Sélectionne 1–2 images packshot pour aider NanoBanana à garder le produit réaliste.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {productOnlyCandidates.slice(0, 6).map((c) => {
                        const selected = selectedProductImageUrls.includes(c.url);
                        return (
                          <button
                            key={c.url}
                            className={`rounded-md border overflow-hidden text-left ${
                              selected ? "ring-2 ring-primary" : ""
                            }`}
                            onClick={() => {
                              setSelectedProductImageUrls((prev) => {
                                const has = prev.includes(c.url);
                                if (has) return prev.filter((u) => u !== c.url);
                                if (prev.length >= 2) return [prev[1], c.url];
                                return [...prev, c.url];
                              });
                            }}
                          >
                            <img src={c.url} alt="Product-only candidate" className="h-44 w-full object-cover" />
                            <div className="p-2 text-xs text-muted-foreground">
                              {c.reason ? c.reason : "Packshot candidate"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs">NanoBanana model</Label>
                    <Select value={nanoModel} onValueChange={(v) => setNanoModel(v as NanoModel)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nano">NanoBanana</SelectItem>
                        <SelectItem value="pro">NanoBanana Pro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={onGenerateImagePrompt} disabled={!analysis || !extracted}>
                    Create “perfect” image prompt
                  </Button>
                  <Button onClick={onGenerateImage} disabled={!extracted || imageGen.kind === "submitting" || imageGen.kind === "polling"}>
                    {imageGen.kind === "submitting" || imageGen.kind === "polling" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Generate image (NanoBanana)
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Video generation</Label>
                <p className="text-xs text-muted-foreground">
                  Provider: <span className="font-medium">Kling 3.0 Standard</span> (KIE Market), aspect 9:16. (15s max.)
                </p>

                <div className="space-y-2">
                  <Label className="text-xs">Template</Label>
                  <Select value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v as TemplateId)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATES.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Best for: {TEMPLATES.find((t) => t.id === selectedTemplate)?.bestFor}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={onBuildVideoPrompt} disabled={!analysis || !selectedImageUrl}>
                    Build UGC prompt from template
                  </Button>
                  <Button onClick={onGenerateVideo} disabled={!selectedImageUrl || videoGen.kind === "submitting" || videoGen.kind === "polling"}>
                    {videoGen.kind === "submitting" || videoGen.kind === "polling" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Generate the UGC video
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Output</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="extract">
                <TabsList>
                  <TabsTrigger value="extract">Extract</TabsTrigger>
                  <TabsTrigger value="analysis">Analysis</TabsTrigger>
                  <TabsTrigger value="image">Image</TabsTrigger>
                  <TabsTrigger value="video">Video</TabsTrigger>
                  <TabsTrigger value="debug">Debug</TabsTrigger>
                </TabsList>

                <TabsContent value="extract" className="space-y-3">
                  {!extracted ? (
                    <div className="rounded-md border bg-background/30 p-4 text-sm text-muted-foreground">
                      Colle une URL puis clique Extract.
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div className="rounded-md border bg-background/30 p-3">
                        <div className="font-medium">{extracted.title ?? "—"}</div>
                        <div className="text-muted-foreground">{extracted.description ?? "—"}</div>
                        <div className="mt-2 text-xs text-muted-foreground break-all">{extracted.url}</div>
                      </div>
                      {extracted.images?.[0] && (
                        <img
                          src={extracted.images[0]}
                          alt="Product"
                          className="w-full rounded-md border object-contain"
                        />
                      )}
                      <div className="rounded-md border bg-background/30 p-3">
                        <div className="text-xs font-medium mb-2">Snippets (keywords)</div>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          {extracted.snippets.slice(0, 6).map((s, i) => (
                            <li key={i}>{s.slice(0, 220)}{s.length > 220 ? "…" : ""}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="analysis" className="space-y-3">
                  {!analysis ? (
                    <div className="rounded-md border bg-background/30 p-4 text-sm text-muted-foreground">
                      Clique “Run GPT analysis”.
                    </div>
                  ) : (
                    <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          copyToClipboard(
                            "GPT analysis (JSON)",
                            JSON.stringify(analysis, null, 2),
                          )
                        }
                      >
                        Copy GPT JSON
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          copyToClipboard(
                            "Step 1 raw sheet",
                            safeString(analysis.step1_rawSheet, ""),
                          )
                        }
                      >
                        Copy Step 1
                      </Button>
                    </div>
                      <div className="rounded-md border bg-background/30 p-3 text-sm whitespace-pre-wrap">
                        {safeString(analysis.step1_rawSheet, "")}
                      </div>
                      <div className="rounded-md border bg-background/30 p-3 text-sm">
                        <div className="font-medium mb-1">Positioning</div>
                        <div className="text-muted-foreground">{safeString(analysis.step2_positioning, "—")}</div>
                      </div>
                      {researchNotes.length > 0 && (
                        <div className="rounded-md border bg-background/30 p-3 text-sm">
                          <div className="font-medium mb-1">GPT research notes</div>
                          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            {researchNotes.slice(0, 8).map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="rounded-md border bg-background/30 p-3 text-sm text-muted-foreground">
                        (Les étapes 3→9 sont stockées et utilisées pour le prompt image + templates vidéo.)
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="image" className="space-y-3">
                  <div className="rounded-md border bg-background/30 p-3 text-sm">
                    <div className="font-medium mb-2">Image prompt</div>
                    <div className="whitespace-pre-wrap text-muted-foreground">
                      {imagePrompt || "— (clique “Create perfect image prompt”) —"}
                    </div>
                    {negativePrompt && (
                      <div className="mt-3">
                        <div className="font-medium mb-1">Negative</div>
                        <div className="whitespace-pre-wrap text-muted-foreground">{negativePrompt}</div>
                      </div>
                    )}
                  </div>

                  {imageGen.kind === "success" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {imageGen.urls.map((u) => (
                        <button
                          key={u}
                          className={`rounded-md border overflow-hidden text-left ${selectedImageUrl === u ? "ring-2 ring-primary" : ""}`}
                          onClick={() => setSelectedImageUrl(u)}
                        >
                          <img src={u} alt="Generated" className="h-64 w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedImageUrl && (
                    <div className="rounded-md border bg-background/30 p-3 text-xs text-muted-foreground break-all">
                      Selected: {selectedImageUrl}
                    </div>
                  )}

                  {imageGen.kind === "error" && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      {imageGen.message}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="video" className="space-y-3">
                  <div className="rounded-md border bg-background/30 p-3 text-sm">
                    <div className="font-medium mb-2">UGC video prompt (template)</div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Button
                        variant="secondary"
                        onClick={() => copyToClipboard("Video prompt", videoPrompt)}
                        disabled={!videoPrompt.trim()}
                      >
                        Copy video prompt
                      </Button>
                    </div>
                    <Textarea
                      value={videoPrompt}
                      onChange={(e) => setVideoPrompt(e.target.value)}
                      rows={10}
                      placeholder="Clique “Build UGC prompt from template”…"
                    />
                  </div>

                  {videoGen.kind === "success" && (
                    <div className="space-y-3">
                      <div className="rounded-md border bg-background/30 p-3 text-xs text-muted-foreground break-all">
                        Video: {videoGen.url}
                      </div>
                      <video src={videoGen.url} controls playsInline className="w-full rounded-md border bg-black" />
                      {videoDownloadHref && (
                        <Button asChild variant="secondary">
                          <a href={videoDownloadHref}>Download</a>
                        </Button>
                      )}
                    </div>
                  )}

                  {videoGen.kind === "error" && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      {videoGen.message}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="debug" className="space-y-3">
                  <div className="rounded-md border bg-background/30 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
                    <div className="font-medium text-sm mb-2">Debug context</div>
                    {JSON.stringify(
                      {
                        step,
                        extracted: extracted
                          ? {
                              url: extracted.url,
                              title: extracted.title,
                              images: extracted.images.slice(0, 3),
                              prices: extracted.signals.prices.slice(0, 6),
                            }
                          : null,
                        productName: currentProductName,
                        imageGen,
                        videoGen,
                      },
                      null,
                      2,
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

