"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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

function withAudioHint(prompt: string) {
  const p = prompt.trim();
  if (!p) return p;
  const lower = p.toLowerCase();
  const mentionsAudio =
    lower.includes("audio") ||
    lower.includes("sound") ||
    lower.includes("voice") ||
    lower.includes("voix") ||
    lower.includes("voiceover") ||
    lower.includes("narration") ||
    lower.includes("asr") ||
    lower.includes("dialogue");
  if (mentionsAudio) return p;
  return `${p}\n\nAudio: ON. Include natural spoken voice and subtle ambient sound.`;
}

export default function AppBrandWizard() {
  const router = useRouter();

  const [step, setStep] = useState<WizardStep>("url");

  const [meEmail, setMeEmail] = useState<string>("");
  const [savedRuns, setSavedRuns] = useState<
    Array<{
      id: string;
      created_at: string;
      store_url: string;
      title: string | null;
      selected_image_url: string | null;
      video_url: string | null;
    }>
  >([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);

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
  const [hasClassifiedImages, setHasClassifiedImages] = useState(false);
  const [productOnlyCandidates, setProductOnlyCandidates] = useState<
    Array<{ url: string; reason?: string }>
  >([]);
  const [selectedProductImageUrls, setSelectedProductImageUrls] = useState<string[]>([]);
  const [isUploadingPackshots, setIsUploadingPackshots] = useState(false);

  const [nanoModel, setNanoModel] = useState<NanoModel>("nano");
  const [imagePrompt, setImagePrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [isCreatingPerfectImagePrompt, setIsCreatingPerfectImagePrompt] =
    useState(false);
  const [imageGen, setImageGen] = useState<ImageGenState>({ kind: "idle" });
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("template1");
  const [videoPrompt, setVideoPrompt] = useState<string>("");
  const [isBuildingVideoPrompt, setIsBuildingVideoPrompt] = useState(false);
  const [videoGen, setVideoGen] = useState<VideoGenState>({ kind: "idle" });

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const currentProductName = useMemo(() => {
    const fromAnalysis = safeString(analysis?.step1_rawSheet ?? "");
    if (extracted?.title) return extracted.title;
    if (fromAnalysis) return fromAnalysis.split("\n")[0]?.slice(0, 120) ?? null;
    return null;
  }, [analysis, extracted?.title]);

  const packshotUrls = useMemo(() => {
    return selectedProductImageUrls;
  }, [selectedProductImageUrls]);

  async function refreshMeAndRuns() {
    setIsLoadingRuns(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMeEmail(user?.email ?? "");

      const res = await fetch("/api/runs/list", { method: "GET", cache: "no-store" });
      const json = (await res.json()) as { data?: any; error?: string };
      if (!res.ok) throw new Error(json.error || "List runs failed");
      setSavedRuns(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      // keep UI usable even if Supabase tables aren't created yet
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.message("Runs non disponibles", { description: message });
    } finally {
      setIsLoadingRuns(false);
    }
  }

  async function saveRun(partial: {
    storeUrl?: string;
    title?: string | null;
    extracted?: unknown;
    analysis?: unknown;
    quiz?: unknown;
    packshotUrls?: string[];
    imagePrompt?: string;
    negativePrompt?: string;
    generatedImageUrls?: string[];
    selectedImageUrl?: string | null;
    videoTemplateId?: string | null;
    videoPrompt?: string;
    videoUrl?: string | null;
  }) {
    try {
      const res = await fetch("/api/runs/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: runId ?? undefined,
          ...partial,
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error || "Save failed");
      if (!runId) setRunId(json.runId);
    } catch (err) {
      // don't block the flow if saving fails
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.message("Sauvegarde impossible", { description: message });
    }
  }

  async function loadRun(id: string) {
    try {
      const res = await fetch(`/api/runs/get?runId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: any; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Load run failed");
      const r = json.data;
      setRunId(r.id);
      setStoreUrl(r.store_url ?? "");
      setExtracted(r.extracted ?? null);
      setAnalysis(r.analysis ?? null);
      setQuiz((q) => ({
        ...q,
        ...(r.quiz ?? {}),
      }));
      setSelectedProductImageUrls(Array.isArray(r.packshot_urls) ? r.packshot_urls : []);
      setImagePrompt(r.image_prompt ?? "");
      setNegativePrompt(r.negative_prompt ?? "");
      if (Array.isArray(r.generated_image_urls) && r.generated_image_urls.length > 0) {
        setImageGen({ kind: "success", urls: r.generated_image_urls });
      } else {
        setImageGen({ kind: "idle" });
      }
      setSelectedImageUrl(r.selected_image_url ?? null);
      setSelectedTemplate((r.video_template_id as any) ?? "template1");
      setVideoPrompt(r.video_prompt ?? "");
      if (typeof r.video_url === "string" && r.video_url.length > 0) {
        setVideoGen({ kind: "success", url: r.video_url });
      } else {
        setVideoGen({ kind: "idle" });
      }

      setStep(r.video_url ? "video" : r.selected_image_url ? "image" : r.analysis ? "quiz" : "url");
      toast.success("Run chargé");
    } catch (err) {
      toast.error("Load error", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  async function onSignOut() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      router.push("/auth");
      router.refresh();
    }
  }

  useEffect(() => {
    void refreshMeAndRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setRunId(null);
      await saveRun({
        storeUrl: url,
        title: (json as any)?.title ?? null,
        extracted: json,
      });
      void refreshMeAndRuns();
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
      await saveRun({
        storeUrl: extracted.url,
        title: extracted.title,
        extracted,
        analysis: json.data,
        quiz: {
          aboutProduct: safeString(pre.aboutProduct, quiz.aboutProduct),
          problems: safeString(pre.problems, quiz.problems),
          promises: safeString(pre.promises, quiz.promises),
          persona: safeString(pre.persona, quiz.persona),
          angles: safeString(pre.angles, quiz.angles),
          offers: safeString(pre.offers, quiz.offers),
          videoDurationPreference:
            pre.videoDurationPreference === "20s" || pre.videoDurationPreference === "30s"
              ? pre.videoDurationPreference
              : "15s",
        },
      });
      void refreshMeAndRuns();
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
      await saveRun({ quiz: { ...quiz, ...(json.data ?? {}) } });
      void refreshMeAndRuns();
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
    setHasClassifiedImages(true);
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
      const normalizedCandidates = candidates
        .filter((x: any) => typeof x?.url === "string")
        .map((x: any) => ({
          url: String(x.url),
          reason: x.reason ? String(x.reason) : undefined,
        }));
      setProductOnlyCandidates(normalizedCandidates);
      const defaults = candidates
        .filter((x: any) => typeof x?.url === "string")
        .slice(0, 2)
        .map((x: any) => String(x.url));
      setSelectedProductImageUrls(defaults);
      await saveRun({ packshotUrls: defaults });
      void refreshMeAndRuns();
      if (normalizedCandidates.length === 0) {
        toast.message("Aucune image “produit seul” détectée", {
          description:
            "Le site n’a peut-être pas de packshots propres. Tu peux continuer avec les images extraites.",
        });
      } else {
        toast.success("Images produit seul détectées", {
          description: `${normalizedCandidates.length} candidate(s)`,
        });
      }
    } catch (err) {
      toast.error("Image classify error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsClassifyingImages(false);
    }
  }

  async function onUploadPackshots(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIsUploadingPackshots(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, 8)) {
        const fd = new FormData();
        fd.set("file", f);
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const json = (await res.json()) as { error?: string; url?: string };
        if (!res.ok || !json.url) {
          throw new Error(json.error || `Upload failed for ${f.name}`);
        }
        urls.push(json.url);
      }
      setSelectedProductImageUrls((prev) => {
        const merged = [...prev];
        for (const u of urls) {
          if (!merged.includes(u)) merged.push(u);
        }
        return merged.slice(0, 8);
      });
      toast.success("Packshots uploadés", { description: `${urls.length} image(s)` });
      await saveRun({ packshotUrls: [...packshotUrls, ...urls].slice(0, 8) });
      void refreshMeAndRuns();
    } catch (err) {
      toast.error("Upload error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsUploadingPackshots(false);
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
    if (packshotUrls.length === 0) {
      toast.error("Ajoute au moins 1 image produit seul (packshot).", {
        description:
          "Si l’IA ne trouve rien, uploade 2–4 angles du produit (face, profil, dos) pour un meilleur résultat.",
      });
      return;
    }
    setIsCreatingPerfectImagePrompt(true);
    try {
      const res = await fetch("/api/gpt/image-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: extracted.url,
          analysis,
          productName: extracted.title,
          productImages: packshotUrls.length > 0 ? packshotUrls : extracted.images,
          quiz: { persona: quiz.persona, videoDurationPreference: quiz.videoDurationPreference },
        }),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Image prompt failed");
      setImagePrompt(String(json.data.imagePrompt ?? ""));
      setNegativePrompt(String(json.data.negativePrompt ?? ""));
      toast.success("Image prompt prêt");
      await saveRun({
        packshotUrls,
        imagePrompt: String(json.data.imagePrompt ?? ""),
        negativePrompt: String(json.data.negativePrompt ?? ""),
      });
      void refreshMeAndRuns();
    } catch (err) {
      toast.error("Image prompt error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
    finally {
      setIsCreatingPerfectImagePrompt(false);
    }
  }

  async function onGenerateImage() {
    if (!extracted) return;
    if (!imagePrompt.trim()) {
      toast.error("Génère le prompt image d’abord.");
      return;
    }
    if (packshotUrls.length === 0) {
      toast.error("Il manque des images “produit seul” (packshots).", {
        description:
          "Uploade 2–4 angles du produit (face, profil, dos) puis relance la génération.",
      });
      return;
    }

    await saveRun({
      storeUrl: extracted.url,
      title: extracted.title ?? null,
      extracted,
      analysis,
      quiz,
      packshotUrls,
      imagePrompt,
      negativePrompt,
    });

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
            packshotUrls.length > 0 ? packshotUrls.slice(0, 4) : extracted.images.slice(0, 2),
          numImages: 1,
          imageSize: "9:16",
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
          const resp = json.data.response ?? {};
          const candidates: unknown[] = [
            (resp as any).resultImageUrl,
            (resp as any).resultUrls,
            (resp as any).resultUrl,
            (resp as any).result_url,
            (resp as any).resultImageUrls,
          ];
          const urls = candidates.flatMap((v) => {
            if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
            if (typeof v === "string") return [v];
            return [];
          });
          if (!urls?.length) throw new Error("Image succeeded but result image URL is missing.");
          setImageGen({ kind: "success", urls });
          setSelectedImageUrl(urls[0]);
          void saveRun({ generatedImageUrls: urls, selectedImageUrl: urls[0] });
          void refreshMeAndRuns();
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

    setIsBuildingVideoPrompt(true);
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
      await saveRun({
        videoTemplateId: selectedTemplate,
        videoPrompt: String(json.data.filledPrompt ?? ""),
      });
      void refreshMeAndRuns();
    } catch (err) {
      toast.error("Template error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
    finally {
      setIsBuildingVideoPrompt(false);
    }
  }

  async function onGenerateVideo() {
    if (!selectedImageUrl) return;
    if (!videoPrompt.trim()) {
      toast.error("Génère le prompt vidéo (template) d’abord.");
      return;
    }

    await saveRun({
      storeUrl: extracted?.url,
      title: extracted?.title ?? null,
      extracted,
      analysis,
      quiz,
      packshotUrls,
      imagePrompt,
      negativePrompt,
      generatedImageUrls: imageGen.kind === "success" ? imageGen.urls : undefined,
      selectedImageUrl,
      videoTemplateId: selectedTemplate,
      videoPrompt,
    });

    setVideoGen({ kind: "submitting" });
    try {
      // Force Kling 3.0 Standard per user request. Kling supports up to 15s.
      const duration =
        quiz.videoDurationPreference === "15s"
          ? 15
          : quiz.videoDurationPreference === "20s"
            ? 15
            : 15;
      const promptWithAudio = withAudioHint(videoPrompt);
      const res = await fetch("/api/kling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketModel: "kling-3.0/video",
          prompt: promptWithAudio,
          imageUrl: selectedImageUrl,
          duration,
          mode: "std",
          sound: true,
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
          void saveRun({ videoUrl: url });
          void refreshMeAndRuns();
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
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">UGC Factory — Brand Analyzer → Image → Video</h1>
            <p className="text-sm text-muted-foreground">
            Colle l’URL du store, on analyse (étapes 1→9), mini quiz, puis génération image NanoBanana et vidéo UGC.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground truncate max-w-[220px] sm:max-w-[320px]" title={meEmail || undefined}>
              {meEmail || "—"}
            </span>
            <Button variant="secondary" size="sm" onClick={onSignOut}>
              Logout
            </Button>
          </div>
        </header>

        <Separator className="my-6" />

        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <Card className="shadow-sm h-fit">
            <CardHeader>
              <CardTitle className="text-base">Historique</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-md border bg-background/30 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Mes runs</div>
                  <div className="text-xs text-muted-foreground">{savedRuns.length}</div>
                </div>
                <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={refreshMeAndRuns} disabled={isLoadingRuns}>
                  {isLoadingRuns ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Refresh
                </Button>
                {savedRuns.length === 0 ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Aucun run sauvegardé pour l’instant.
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {savedRuns.slice(0, 6).map((r) => (
                      <button
                        key={r.id}
                        onClick={() => loadRun(r.id)}
                        className={`w-full rounded-md border px-2 py-2 text-left hover:bg-muted/40 ${
                          runId === r.id ? "bg-muted/30" : ""
                        }`}
                        title="Charger ce run"
                      >
                        <div className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </div>
                        <div className="text-sm font-medium">
                          {r.title ? r.title.slice(0, 50) : r.store_url.slice(0, 50)}
                        </div>
                        <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                          <span>{r.selected_image_url ? "image" : "—"}</span>
                          <span>·</span>
                          <span>{r.video_url ? "video" : "—"}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {(
                [
                  {
                    id: "url",
                    label: "1) URL & extraction",
                    done: Boolean(extracted),
                    note: extracted?.title ?? (storeUrl ? storeUrl : ""),
                  },
                  {
                    id: "analysis",
                    label: "2) Analyse GPT (1→9)",
                    done: Boolean(analysis),
                    note: analysis ? safeString(analysis.step2_positioning, "").slice(0, 90) : "",
                  },
                  {
                    id: "quiz",
                    label: "3) Mini-quiz",
                    done: Boolean(analysis) && (quiz.persona.trim().length > 0 || quiz.aboutProduct.trim().length > 0),
                    note: quiz.persona ? quiz.persona.slice(0, 90) : "",
                  },
                  {
                    id: "image",
                    label: "4) Prompt → image (NanoBanana)",
                    done: imageGen.kind === "success",
                    note: imagePrompt ? imagePrompt.slice(0, 90) : "",
                  },
                  {
                    id: "video",
                    label: "5) Template → vidéo (Kling 3.0 Std)",
                    done: videoGen.kind === "success",
                    note: videoPrompt ? videoPrompt.slice(0, 90) : "",
                  },
                ] as Array<{
                  id: WizardStep;
                  label: string;
                  done: boolean;
                  note: string;
                }>
              ).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStep(s.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/40 ${
                    step === s.id ? "bg-muted/30" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{s.label}</div>
                    {s.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/60" />
                    )}
                  </div>
                  {s.note ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {s.note.length > 120 ? `${s.note.slice(0, 120)}…` : s.note}
                    </div>
                  ) : null}
                </button>
              ))}
              <div className="pt-2 text-xs text-muted-foreground">
                Astuce: tu peux cliquer sur une étape pour revenir en arrière.
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <div className="text-xs text-muted-foreground">
                step: <span className="font-medium text-foreground">{step}</span>
              </div>
              {extracted?.title ? (
                <div className="text-xs text-muted-foreground">
                  produit: <span className="font-medium text-foreground">{extracted.title.slice(0, 60)}</span>
                </div>
              ) : null}
              {nanoModel === "pro" ? (
                <div className="text-xs text-muted-foreground">
                  modèle: <span className="font-medium text-foreground">NanoBanana Pro</span>
                </div>
              ) : null}
            </div>

            {step === "url" && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">1) URL & extraction</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Store URL</Label>
                    <Input value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} placeholder="https://..." />
                    <Button onClick={onExtract} disabled={isExtracting}>
                      {isExtracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Extract
                    </Button>
                  </div>

                  {!extracted ? (
                    <div className="rounded-md border bg-background/30 p-4 text-sm text-muted-foreground">
                      Colle une URL puis clique Extract.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-md border bg-background/30 p-3">
                        <div className="font-medium">{extracted.title ?? "—"}</div>
                        <div className="text-sm text-muted-foreground">{extracted.description ?? "—"}</div>
                        <div className="mt-2 text-xs text-muted-foreground break-all">{extracted.url}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => setStep("analysis")} disabled={!extracted}>
                          Next → Analyse
                        </Button>
                      </div>
                      {extracted.images?.length ? (
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            Images trouvées: <span className="font-medium">{extracted.images.length}</span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            {extracted.images.slice(0, 6).map((u) => (
                              <img
                                key={u}
                                src={u}
                                alt="Extracted"
                                className="h-28 w-full rounded-md border object-cover"
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {step === "analysis" && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">2) Analyse GPT (1→9)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={onAnalyze} disabled={!extracted || isAnalyzing}>
                      {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Run GPT analysis (1→9)
                    </Button>
                    <Button variant="secondary" onClick={() => setStep("quiz")} disabled={!analysis}>
                      Next → Quiz
                    </Button>
                  </div>

                  {!analysis ? (
                    <div className="rounded-md border bg-background/30 p-4 text-sm text-muted-foreground">
                      Clique “Run GPT analysis”.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => copyToClipboard("GPT analysis (JSON)", JSON.stringify(analysis, null, 2))}
                        >
                          Copy GPT JSON
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => copyToClipboard("Step 1 raw sheet", safeString(analysis.step1_rawSheet, ""))}
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
                      {researchNotes.length > 0 ? (
                        <div className="rounded-md border bg-background/30 p-3 text-sm">
                          <div className="font-medium mb-1">GPT research notes</div>
                          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            {researchNotes.slice(0, 8).map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {step === "quiz" && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">3) Mini-quiz (pré-rempli)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={onAutoFillQuiz} disabled={!extracted || isQuizAutofilling}>
                      {isQuizAutofilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Auto-répondre (depuis l’URL)
                    </Button>
                    <Button variant="secondary" onClick={() => setStep("image")} disabled={!analysis}>
                      Next → Image
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {quizPrecisionNote ||
                      "Auto-répondre aide à démarrer, mais ce sera plus précis si vous le rentrez vous-même."}
                  </p>

                  <div className="grid gap-3">
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
                            videoDurationPreference: v === "20s" || v === "30s" ? v : "15s",
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
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === "image" && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">4) Prompt → image (NanoBanana)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={onFindProductOnlyImages}
                      disabled={!extracted?.images?.length || isClassifyingImages}
                    >
                      {isClassifyingImages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Trouver images “produit seul” (AI)
                    </Button>
                    <Select value={nanoModel} onValueChange={(v) => setNanoModel(v as NanoModel)}>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nano">NanoBanana</SelectItem>
                        <SelectItem value="pro">NanoBanana Pro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {productOnlyCandidates.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Sélectionne 1–4 images packshot (multi-angles) pour aider NanoBanana à garder le produit réaliste.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {productOnlyCandidates.slice(0, 6).map((c) => {
                          const selected = selectedProductImageUrls.includes(c.url);
                          return (
                            <button
                              key={c.url}
                              className={`rounded-md border overflow-hidden text-left transition ${
                                selected ? "ring-2 ring-primary" : "hover:bg-muted/30"
                              }`}
                              onClick={() => {
                                setSelectedProductImageUrls((prev) => {
                                  const has = prev.includes(c.url);
                                  if (has) return prev.filter((u) => u !== c.url);
                                  if (prev.length >= 4) return [...prev.slice(1), c.url];
                                  return [...prev, c.url];
                                });
                              }}
                            >
                              <img src={c.url} alt="Product-only candidate" className="h-44 w-full object-cover" />
                              <div className="p-2 text-xs text-muted-foreground">
                                <div className="font-medium text-foreground/90">
                                  {c.reason ? c.reason : "Packshot candidate"}
                                </div>
                                <div className="mt-1 break-all opacity-80">{c.url}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : hasClassifiedImages && !isClassifyingImages ? (
                    <div className="rounded-md border bg-background/30 p-3 text-sm text-muted-foreground">
                      Aucun packshot “produit seul” détecté sur cette page.
                      <div className="mt-2 text-xs">
                        Pour de meilleurs résultats, uploade 2–4 images du produit seul (face, profil, dos, détail).
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-md border bg-background/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Upload packshots (produit seul)</div>
                        <div className="text-xs text-muted-foreground">
                          Idéal: 2–4 angles. Formats: jpg/png/webp.
                        </div>
                      </div>
                      <label className={`text-sm ${isUploadingPackshots ? "opacity-60" : "cursor-pointer"}`}>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={isUploadingPackshots}
                          onChange={(e) => onUploadPackshots(e.currentTarget.files)}
                        />
                        <Button type="button" variant="secondary" disabled={isUploadingPackshots}>
                          {isUploadingPackshots ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Upload images
                        </Button>
                      </label>
                    </div>

                    {packshotUrls.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-xs text-muted-foreground mb-2">
                          Packshots sélectionnés: <span className="font-medium">{packshotUrls.length}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-4">
                          {packshotUrls.slice(0, 8).map((u) => (
                            <button
                              key={u}
                              className="rounded-md border overflow-hidden hover:opacity-90"
                              onClick={() => setLightboxUrl(u)}
                              title="Clique pour agrandir"
                            >
                              <img src={u} alt="Packshot" className="h-24 w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-muted-foreground">
                        Aucun packshot sélectionné pour l’instant.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={onGenerateImagePrompt}
                      disabled={
                        !analysis ||
                        !extracted ||
                        isCreatingPerfectImagePrompt ||
                        (imagePrompt.trim().length > 0 && negativePrompt.trim().length > 0)
                      }
                    >
                      {isCreatingPerfectImagePrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {imagePrompt.trim().length > 0 ? "Prompt déjà généré" : "Create “perfect” image prompt"}
                    </Button>
                    {imagePrompt.trim().length > 0 ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setImagePrompt("");
                          setNegativePrompt("");
                        }}
                      >
                        Regenerate
                      </Button>
                    ) : null}
                    <Button
                      onClick={onGenerateImage}
                      disabled={!extracted || imageGen.kind === "submitting" || imageGen.kind === "polling"}
                    >
                      {imageGen.kind === "submitting" || imageGen.kind === "polling" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Generate image (NanoBanana)
                    </Button>
                    <Button variant="secondary" onClick={() => setStep("video")} disabled={!selectedImageUrl}>
                      Next → Video
                    </Button>
                  </div>

                  <div className="rounded-md border bg-background/30 p-3 text-sm">
                    <div className="font-medium mb-2">Image prompt</div>
                    <div className="whitespace-pre-wrap text-muted-foreground">
                      {imagePrompt || "— (clique “Create perfect image prompt”) —"}
                    </div>
                    {negativePrompt ? (
                      <div className="mt-3">
                        <div className="font-medium mb-1">Negative</div>
                        <div className="whitespace-pre-wrap text-muted-foreground">{negativePrompt}</div>
                      </div>
                    ) : null}
                  </div>

                  {imageGen.kind === "success" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {imageGen.urls.map((u) => (
                        <button
                          key={u}
                          className={`rounded-md border overflow-hidden text-left ${
                            selectedImageUrl === u ? "ring-2 ring-primary" : ""
                          }`}
                          onClick={() => {
                            setSelectedImageUrl(u);
                            setLightboxUrl(u);
                          }}
                          title="Clique pour agrandir"
                        >
                          <img src={u} alt="Generated" className="h-64 w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {selectedImageUrl ? (
                    <div className="rounded-md border bg-background/30 p-3 text-xs text-muted-foreground break-all">
                      Selected: {selectedImageUrl}
                    </div>
                  ) : null}

                  {imageGen.kind === "error" ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      {imageGen.message}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {step === "video" && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">5) Template → vidéo (Kling 3.0 Standard)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Provider: <span className="font-medium">Kling 3.0 Standard</span> (KIE Market), aspect 9:16. (15s
                    max.)
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
                    <Button
                      variant="secondary"
                      onClick={onBuildVideoPrompt}
                      disabled={
                        !analysis ||
                        !selectedImageUrl ||
                        isBuildingVideoPrompt ||
                        (videoPrompt.trim().length > 0 && videoGen.kind !== "error")
                      }
                    >
                      {isBuildingVideoPrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {videoPrompt.trim().length > 0 ? "Prompt déjà généré" : "Build UGC prompt from template"}
                    </Button>
                    {videoPrompt.trim().length > 0 ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setVideoPrompt("");
                        }}
                      >
                        Regenerate
                      </Button>
                    ) : null}
                    <Button
                      onClick={onGenerateVideo}
                      disabled={!selectedImageUrl || videoGen.kind === "submitting" || videoGen.kind === "polling"}
                    >
                      {videoGen.kind === "submitting" || videoGen.kind === "polling" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Generate the UGC video
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => copyToClipboard("Video prompt", videoPrompt)}
                      disabled={!videoPrompt.trim()}
                    >
                      Copy video prompt
                    </Button>
                  </div>

                  <div className="rounded-md border bg-background/30 p-3 text-sm">
                    <div className="font-medium mb-2">UGC video prompt (template)</div>
                    <Textarea
                      value={videoPrompt}
                      onChange={(e) => setVideoPrompt(e.target.value)}
                      rows={10}
                      placeholder="Clique “Build UGC prompt from template”…"
                    />
                  </div>

                  {videoGen.kind === "success" ? (
                    <div className="space-y-3">
                      <div className="rounded-md border bg-background/30 p-3 text-xs text-muted-foreground break-all">
                        Video: {videoGen.url}
                      </div>
                      <video src={videoGen.url} controls playsInline className="w-full rounded-md border bg-black" />
                      {videoDownloadHref ? (
                        <Button asChild variant="secondary">
                          <a href={videoDownloadHref}>Download</a>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {videoGen.kind === "error" ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      {videoGen.message}
                    </div>
                  ) : null}

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
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
          role="button"
          tabIndex={0}
        >
          <div className="absolute right-4 top-4">
            <Button
              variant="secondary"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxUrl(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mx-auto flex h-full max-w-5xl items-center justify-center px-4">
            <img
              src={lightboxUrl}
              alt="Preview"
              className="max-h-[90vh] w-auto max-w-full rounded-md border bg-black object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

