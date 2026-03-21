"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GitBranch, Loader2, Play, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import LinkToAdUniverse from "@/app/_components/LinkToAdUniverse";
import { ProjectLabCanvas } from "@/app/_components/ProjectLabCanvas";
import { ProjectRunBrandBriefEditor } from "@/app/_components/ProjectRunBrandBriefEditor";
import { ProjectRunScriptsEditor } from "@/app/_components/ProjectRunScriptsEditor";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import StudioImagePanel from "@/app/_components/StudioImagePanel";
import StudioShell from "@/app/_components/StudioShell";
import StudioVideoPanel from "@/app/_components/StudioVideoPanel";
import {
  packshotUrlsForGpt,
  pickPackshotForNanoBanana,
  productUrlsForGpt,
} from "@/lib/productReferenceImages";
import {
  branchUniverseForNewAd,
  cloneExtractedBase,
  readUniverseFromExtracted,
  universeHasPendingKlingTask,
} from "@/lib/linkToAdUniverse";

type WizardStep = "url" | "analysis" | "quiz" | "image" | "video";
type AppSection = "link_to_ad" | "motion_control" | "image" | "video" | "projects";

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

const UGC_CURRENT_RUN_KEY = "ugc_current_run_id";

const APP_VALID_SECTIONS: AppSection[] = [
  "link_to_ad",
  "motion_control",
  "image",
  "video",
  "projects",
];

function sectionFromSearchParams(sp: URLSearchParams): AppSection {
  const s = sp.get("section");
  if (s && APP_VALID_SECTIONS.includes(s as AppSection)) return s as AppSection;
  return "link_to_ad";
}

/** Stable identity for sync: project id + section (avoids ?a=1&b=2 vs ?b=2&a=1 churn). */
function appRouteKey(project: string, section: AppSection) {
  return `${project}\0${section}`;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    const href = u.toString();
    return href.endsWith("/") ? href.slice(0, -1) : href;
  } catch {
    const t = url.trim();
    const noSlash = t.endsWith("/") ? t.slice(0, -1) : t;
    return noSlash.toLowerCase();
  }
}

/** Link to Ad Universe snapshot stored under `extracted.__universe`. */
function runHasLinkToAdUniverse(extracted: unknown): boolean {
  if (!extracted || typeof extracted !== "object") return false;
  const u = (extracted as Record<string, unknown>).__universe;
  if (!u || typeof u !== "object") return false;
  return (u as { v?: unknown }).v === 1;
}

function universeThumbFromExtracted(extracted: unknown): string | null {
  if (!extracted || typeof extracted !== "object") return null;
  const u = (extracted as Record<string, unknown>).__universe;
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  if (typeof o.neutralUploadUrl === "string" && o.neutralUploadUrl.trim()) return o.neutralUploadUrl.trim();
  const cc = o.cleanCandidate;
  if (cc && typeof cc === "object" && typeof (cc as { url?: string }).url === "string") {
    const url = (cc as { url: string }).url.trim();
    if (url) return url;
  }
  if (typeof o.fallbackImageUrl === "string" && o.fallbackImageUrl.trim()) return o.fallbackImageUrl.trim();
  return null;
}

type RunGenerationPreview =
  | { kind: "image"; url: string }
  | { kind: "video" }
  | null;

function runGenerationPreview(run: {
  extracted?: unknown;
  video_url: string | null;
  selected_image_url: string | null;
  generated_image_urls?: string[] | null;
}): RunGenerationPreview {
  const img =
    universeThumbFromExtracted(run.extracted) ||
    run.selected_image_url ||
    (Array.isArray(run.generated_image_urls) && run.generated_image_urls[0]) ||
    null;
  if (img) return { kind: "image", url: img };
  if (run.video_url) return { kind: "video" };
  return null;
}

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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<WizardStep>("url");
  const [appSection, setAppSection] = useState<AppSection>("link_to_ad");

  const [savedRuns, setSavedRuns] = useState<
    Array<{
      id: string;
      created_at: string;
      store_url: string;
      title: string | null;
      selected_image_url: string | null;
      video_url: string | null;
      generated_image_urls?: string[] | null;
      extracted?: unknown;
    }>
  >([]);
  /** Open Link to Ad and hydrate from this run (Projects). */
  const [linkToAdResumeRunId, setLinkToAdResumeRunId] = useState<string | null>(null);
  const [branchingNormalizedUrl, setBranchingNormalizedUrl] = useState<string | null>(null);
  const [deleteProjectDialog, setDeleteProjectDialog] = useState<{
    storeUrl: string;
    runIds: string[];
    label: string;
  } | null>(null);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false);
  /** Full-screen “lab” graph: architecture of Link to Ad generations for a store URL. */
  const [projectLab, setProjectLab] = useState<{
    title: string;
    storeUrl: string;
    runs: (typeof savedRuns)[number][];
  } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  /** While set, ignore URL→section sync so stale ?section= in the bar cannot overwrite a sidebar click before router.replace runs. */
  const pendingSectionNavRef = useRef<AppSection | null>(null);
  /** After we call router.replace, ignore one URL→state pass so Next’s searchParams cannot fight our appSection (fixes link_to_ad ↔ projects loops). */
  const lastPushedRouteKeyRef = useRef<string | null>(null);

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
  const packshotFileInputRef = useRef<HTMLInputElement>(null);

  type MotionSubTab = "create" | "edit" | "control";
  const [motionSubTab, setMotionSubTab] = useState<MotionSubTab>("control");
  const [motionVideoRefReady, setMotionVideoRefReady] = useState(false);
  const [motionVideoRefFileName, setMotionVideoRefFileName] = useState<string>("");
  const [motionVideoDurationSeconds, setMotionVideoDurationSeconds] = useState<number>(12);
  const [motionCharacterImageUrl, setMotionCharacterImageUrl] = useState<string | null>(null);
  const [motionModel, setMotionModel] = useState<string>("kling-3.0-motion-control");
  const [motionQuality, setMotionQuality] = useState<string>("720p");
  const [motionIsGenerating, setMotionIsGenerating] = useState(false);
  const motionVideoInputRef = useRef<HTMLInputElement>(null);
  const motionCharacterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (motionCharacterImageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(motionCharacterImageUrl);
      }
    };
  }, [motionCharacterImageUrl]);

  const currentProductName = useMemo(() => {
    const fromAnalysis = safeString(analysis?.step1_rawSheet ?? "");
    if (extracted?.title) return extracted.title;
    if (fromAnalysis) return fromAnalysis.split("\n")[0]?.slice(0, 120) ?? null;
    return null;
  }, [analysis, extracted?.title]);

  const packshotUrls = useMemo(() => {
    return selectedProductImageUrls;
  }, [selectedProductImageUrls]);

  // Group runs by product URL = "projects". One project = one store URL with all its runs (datas + generations).
  const projects = useMemo(() => {
    const byUrl = new Map<
      string,
      { storeUrl: string; title: string | null; runs: (typeof savedRuns)[number][] }
    >();
    for (const r of savedRuns) {
      const url = typeof r.store_url === "string" ? normalizeUrl(r.store_url) : "";
      if (!url) continue;
      const existing = byUrl.get(url);
      const runEntry = {
        ...r,
        store_url: r.store_url,
      };
      if (existing) {
        existing.runs.push(runEntry);
      } else {
        byUrl.set(url, {
          storeUrl: r.store_url,
          title: r.title ?? null,
          runs: [runEntry],
        });
      }
    }
    // Sort runs inside each project by created_at desc (newest first)
    const out: Array<{ storeUrl: string; normalizedUrl: string; title: string | null; runs: (typeof savedRuns)[number][] }> = [];
    byUrl.forEach((v, normalizedUrl) => {
      const runs = [...v.runs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      out.push({
        storeUrl: v.storeUrl,
        normalizedUrl,
        title: v.title,
        runs,
      });
    });
    out.sort((a, b) => new Date(b.runs[0].created_at).getTime() - new Date(a.runs[0].created_at).getTime());
    return out;
  }, [savedRuns]);

  function resetForNewProject() {
    setStep("url");
    setRunId(null);
    if (typeof localStorage !== "undefined") localStorage.removeItem(UGC_CURRENT_RUN_KEY);
    setStoreUrl("");
    setExtracted(null);
    setAnalysis(null);
    setResearchNotes([]);
    setQuiz({
      aboutProduct: "",
      problems: "",
      promises: "",
      persona: "",
      angles: "",
      offers: "",
      videoDurationPreference: "15s",
    });
    setSelectedProductImageUrls([]);
    setNanoModel("nano");
    setImagePrompt("");
    setNegativePrompt("");
    setImageGen({ kind: "idle" });
    setSelectedImageUrl(null);
    setSelectedTemplate("template1");
    setVideoPrompt("");
    setIsBuildingVideoPrompt(false);
    setVideoGen({ kind: "idle" });
    setLightboxUrl(null);
  }

  async function onManualSaveProject() {
    const url = storeUrl.trim();
    if (!url) {
      toast.error("Paste the store URL / product page URL before saving.");
      return;
    }
    await saveRun({
      storeUrl: url,
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
      videoUrl: videoGen.kind === "success" ? videoGen.url : null,
    });
    void refreshMeAndRuns();
    toast.success("Project saved");
  }

  async function refreshMeAndRuns() {
    setIsLoadingRuns(true);
    try {
      const res = await fetch("/api/runs/list", { method: "GET", cache: "no-store" });
      const json = (await res.json()) as { data?: any; error?: string };
      if (!res.ok) throw new Error(json.error || "List runs failed");
      const runs = Array.isArray(json.data) ? json.data : [];
      setSavedRuns(runs);

      const pendingKling = runs.filter((r: { id: string; extracted?: unknown }) => {
        if (!runHasLinkToAdUniverse(r.extracted)) return false;
        const s = readUniverseFromExtracted(r.extracted);
        return universeHasPendingKlingTask(s);
      });
      if (pendingKling.length > 0) {
        void (async () => {
          for (const r of pendingKling as { id: string }[]) {
            try {
              await fetch("/api/runs/finalize-kling", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ runId: r.id }),
              });
            } catch {
              /* ignore */
            }
          }
          try {
            const res2 = await fetch("/api/runs/list", { method: "GET", cache: "no-store" });
            const j2 = (await res2.json()) as { data?: unknown[] };
            if (res2.ok && Array.isArray(j2.data)) {
              setSavedRuns(j2.data as typeof runs);
            }
          } catch {
            /* ignore */
          }
        })();
      }
    } catch (err) {
      // keep UI usable even if Supabase tables aren't created yet
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.message("Runs unavailable", { description: message });
    } finally {
      setIsLoadingRuns(false);
    }
  }

  async function startNewLinkToAdFromProject(
    proj: (typeof projects)[number],
  ) {
    const sourceRun =
      proj.runs.find((r) => runHasLinkToAdUniverse(r.extracted)) ?? proj.runs[0];
    if (!sourceRun || !runHasLinkToAdUniverse(sourceRun.extracted)) {
      toast.error("No Link to Ad data for this project.");
      return;
    }
    const snap = readUniverseFromExtracted(sourceRun.extracted);
    if (!snap) {
      toast.error("Could not read Link to Ad state.");
      return;
    }
    if (!snap.scriptsText.trim()) {
      toast.error("Generate scripts on an existing run first.");
      return;
    }
    setBranchingNormalizedUrl(proj.normalizedUrl);
    try {
      const branched = branchUniverseForNewAd(snap);
      const base = cloneExtractedBase(sourceRun.extracted);
      const extracted = { ...base, __universe: branched };
      const packUrls = productUrlsForGpt({
        pageUrl: proj.storeUrl.trim(),
        neutralUploadUrl: branched.neutralUploadUrl,
        candidateUrls:
          branched.productOnlyImageUrls && branched.productOnlyImageUrls.length > 0
            ? branched.productOnlyImageUrls
            : branched.cleanCandidate?.url
              ? [branched.cleanCandidate.url]
              : [],
        fallbackUrl: branched.fallbackImageUrl,
      });
      const res = await fetch("/api/runs/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeUrl: proj.storeUrl,
          title: proj.title ?? sourceRun.title ?? null,
          extracted,
          packshotUrls: packUrls.length ? packUrls.slice(0, 12) : undefined,
          imagePrompt: "",
          selectedImageUrl: null,
          generatedImageUrls: [],
          videoPrompt: "",
          videoUrl: null,
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error || "Failed to create run.");
      await refreshMeAndRuns();
      setRunId(json.runId);
      if (typeof localStorage !== "undefined") localStorage.setItem(UGC_CURRENT_RUN_KEY, json.runId);
      setStoreUrl(proj.storeUrl);
      setLinkToAdResumeRunId(json.runId);
      setAppSectionNav("link_to_ad");
      toast.success("New ad — pick a marketing angle.");
    } catch (err) {
      toast.error("Error", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setBranchingNormalizedUrl(null);
    }
  }

  async function executeDeleteProject(storeUrl: string, runIdsInProject: string[]) {
    setDeleteProjectLoading(true);
    try {
      const res = await fetch("/api/runs/delete-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl }),
      });
      const json = (await res.json()) as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(json.error || "Delete failed");
      toast.success(`Project deleted (${json.deleted ?? 0} run(s))`);
      if (runId && runIdsInProject.includes(runId)) {
        setRunId(null);
        if (typeof localStorage !== "undefined") localStorage.removeItem(UGC_CURRENT_RUN_KEY);
      }
      if (linkToAdResumeRunId && runIdsInProject.includes(linkToAdResumeRunId)) {
        setLinkToAdResumeRunId(null);
      }
      setDeleteProjectDialog(null);
      void refreshMeAndRuns();
    } catch (err) {
      toast.error("Deletion failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDeleteProjectLoading(false);
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
      if (json.runId) localStorage.setItem(UGC_CURRENT_RUN_KEY, json.runId);
    } catch (err) {
      // don't block the flow if saving fails
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.message("Save failed", { description: message });
    }
  }

  async function loadRun(id: string) {
    try {
      const res = await fetch(`/api/runs/get?runId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: any; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Load run failed");
      const r = json.data;
      setRunId(r.id);
      localStorage.setItem(UGC_CURRENT_RUN_KEY, r.id);
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
      toast.success("Run loaded");
    } catch (err) {
      localStorage.removeItem(UGC_CURRENT_RUN_KEY);
      toast.error("Load error", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  useEffect(() => {
    const runIdFromUrl = searchParams.get("project");
    const savedRunId = typeof localStorage !== "undefined" ? localStorage.getItem(UGC_CURRENT_RUN_KEY) : null;
    const initialRunId = (runIdFromUrl && runIdFromUrl.trim()) || (savedRunId && savedRunId.trim()) || null;
    if (initialRunId) {
      void loadRun(initialRunId);
    }
    void refreshMeAndRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (runId) localStorage.setItem(UGC_CURRENT_RUN_KEY, runId);
    else if (typeof localStorage !== "undefined") localStorage.removeItem(UGC_CURRENT_RUN_KEY);
  }, [runId]);

  const setAppSectionNav = useCallback((s: AppSection) => {
    pendingSectionNavRef.current = s;
    setAppSection(s);
  }, []);

  const searchKey = searchParams.toString();

  useLayoutEffect(() => {
    const curProject = searchParams.get("project") ?? "";
    const sec = sectionFromSearchParams(searchParams);
    const incomingKey = appRouteKey(curProject, sec);

    if (lastPushedRouteKeyRef.current !== null && incomingKey === lastPushedRouteKeyRef.current) {
      lastPushedRouteKeyRef.current = null;
      const pending = pendingSectionNavRef.current;
      if (pending !== null && sec === pending) {
        pendingSectionNavRef.current = null;
      }
      return;
    }

    const pending = pendingSectionNavRef.current;
    if (pending !== null) {
      if (sec === pending) {
        pendingSectionNavRef.current = null;
      }
      return;
    }

    setAppSection((prev) => (prev === sec ? prev : sec));
  }, [searchKey]);

  useEffect(() => {
    if (!deleteProjectDialog || deleteProjectLoading) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteProjectDialog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteProjectDialog, deleteProjectLoading]);

  /** Finalize KIE/Kling videos that finished while the user was on another tab (client polling had stopped). */
  useEffect(() => {
    if (appSection !== "projects") return;
    let cancelled = false;
    void (async () => {
      try {
        const listRes = await fetch("/api/runs/list", { method: "GET", cache: "no-store" });
        const json = (await listRes.json()) as {
          data?: Array<{ id: string; extracted?: unknown }>;
          error?: string;
        };
        if (!listRes.ok || !Array.isArray(json.data)) return;
        const runs = json.data;
        const pending = runs.filter((r) => {
          if (!runHasLinkToAdUniverse(r.extracted)) return false;
          const s = readUniverseFromExtracted(r.extracted);
          return universeHasPendingKlingTask(s);
        });
        for (const r of pending) {
          if (cancelled) return;
          try {
            await fetch("/api/runs/finalize-kling", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ runId: r.id }),
            });
          } catch {
            /* ignore */
          }
        }
        if (!cancelled) {
          await refreshMeAndRuns();
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when opening Projects
  }, [appSection]);

  useEffect(() => {
    if (pathname !== "/app") return;
    const curProject = searchParams.get("project") ?? "";
    const curSec = sectionFromSearchParams(searchParams);

    // Before loadRun() sets runId, keep ?project= but still sync ?section=.
    if (!runId && curProject) {
      const curKey = appRouteKey(curProject, curSec);
      const wantKey = appRouteKey(curProject, appSection);
      if (wantKey !== curKey) {
        lastPushedRouteKeyRef.current = wantKey;
        const p = new URLSearchParams(searchParams.toString());
        p.set("project", curProject);
        p.set("section", appSection);
        router.replace(`/app?${p.toString()}`);
      }
      return;
    }

    const wantProject = runId ?? "";
    const curKey = appRouteKey(curProject, curSec);
    const wantKey = appRouteKey(wantProject, appSection);
    if (wantKey === curKey) return;

    lastPushedRouteKeyRef.current = wantKey;
    const p = new URLSearchParams();
    if (runId) p.set("project", runId);
    p.set("section", appSection);
    router.replace(`/app?${p.toString()}`);
  }, [runId, appSection, pathname, router, searchKey]);

  async function onExtract() {
    const url = storeUrl.trim();
    if (!url) {
      toast.error("Paste a store URL / product page URL.");
      return;
    }

    // Fast path: if we already have a saved run for this product URL, reuse it
    // to avoid re-scraping / re-analyzing and speed up UGC creation.
    if (savedRuns.length > 0) {
      const target = normalizeUrl(url);
      const existing = savedRuns
        .filter((r) => typeof r.store_url === "string" && normalizeUrl(r.store_url) === target)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )[0];
      if (existing) {
        await loadRun(existing.id);
        toast.success("Product already analyzed loaded from history");
        return;
      }
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
      if (typeof localStorage !== "undefined") localStorage.removeItem(UGC_CURRENT_RUN_KEY);
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
        toast.message("No product-only images detected", {
          description:
            "The site may not have clean packshots. You can continue with the extracted images.",
        });
      } else {
        toast.success("Product-only images detected", {
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
        const raw = await res.text();
        let json: { error?: string; url?: string } = {};
        try {
          if (raw.length > 0) json = JSON.parse(raw) as { error?: string; url?: string };
        } catch {
          throw new Error(
            res.ok ? "Invalid server response" : `Upload failed (${res.status}): ${raw.slice(0, 200)}`,
          );
        }
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
      toast.success("Packshots uploaded", { description: `${urls.length} image(s)` });
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
      toast.error("Add at least 1 product-only image (packshot).", {
        description:
          "If the AI finds nothing, upload 2–4 product angles (front, side, back) for better results.",
      });
      return;
    }
    setIsCreatingPerfectImagePrompt(true);
    try {
      const productImagesForGpt = packshotUrlsForGpt(
        extracted.url,
        packshotUrls,
        Array.isArray(extracted.images) && typeof extracted.images[0] === "string" ? extracted.images[0] : null,
      );
      const res = await fetch("/api/gpt/image-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: extracted.url,
          analysis,
          productName: extracted.title,
          productImages:
            productImagesForGpt.length > 0
              ? productImagesForGpt
              : packshotUrls.length > 0
                ? packshotUrls
                : extracted.images,
          quiz: { persona: quiz.persona, videoDurationPreference: quiz.videoDurationPreference },
        }),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Image prompt failed");
      setImagePrompt(String(json.data.imagePrompt ?? ""));
      setNegativePrompt(String(json.data.negativePrompt ?? ""));
      toast.success("Image prompt ready");
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
      toast.error("Generate the image prompt first.");
      return;
    }
    if (packshotUrls.length === 0) {
      toast.error("Missing product-only images (packshots).", {
        description:
          "Upload 2–4 product-only angles (front, side, back) and retry generation.",
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
      const nanoRefUrl = pickPackshotForNanoBanana(
        extracted.url,
        packshotUrls,
        Array.isArray(extracted.images) && typeof extracted.images[0] === "string" ? extracted.images[0] : null,
      );
      if (!nanoRefUrl) {
        toast.error("Aucune image produit HTTPS valide pour NanoBanana (packshot requis).");
        setImageGen({ kind: "idle" });
        return;
      }
      const res = await fetch("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: nanoModel,
          prompt: imagePrompt,
          imageUrls: [nanoRefUrl],
          numImages: 1,
          imageSize: "9:16",
          aspectRatio: "9:16",
          resolution: "2K",
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "NanoBanana generate failed");
      setImageGen({ kind: "polling", taskId: json.taskId });
      toast.success("Image task created", { description: json.taskId });
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
      toast.error("Select the generated image first.");
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
      toast.success("Template filled");
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
      toast.error("Generate the video prompt (template) first.");
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
      // Kling 3.0 Standard, 15s, always with native audio ON.
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
          mode: "std", // 720p Standard
          sound: true,
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Video generate failed");
      setVideoGen({ kind: "polling", taskId: json.taskId });
      toast.success("Video task created", { description: json.taskId });
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
    <>
      <StudioShell
        studioSection={appSection}
        onStudioSectionChange={setAppSectionNav}
        studioProjectId={runId}
      >
        <section className="space-y-6 px-6 py-6 md:px-8">
          <div className="space-y-6">
            {appSection === "projects" ? (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base">My Projects</CardTitle>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
                        onClick={refreshMeAndRuns}
                        disabled={isLoadingRuns}
                      >
                        {isLoadingRuns ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Refresh
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
                        onClick={resetForNewProject}
                      >
                        New
                      </Button>
                      <Button type="button" size="sm" onClick={onManualSaveProject}>
                        Save
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {projects.length === 0 ? (
                    <div className="rounded-md border border-white/10 bg-white/5 p-4 text-sm text-white/65">
                      No projects yet. Start a run to create your first project.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {projects.map((proj) => {
                        const latestRun = proj.runs[0];
                        const isUniverse = runHasLinkToAdUniverse(latestRun.extracted);
                        const isActive =
                          proj.runs.some(
                            (r) => runId === r.id || linkToAdResumeRunId === r.id,
                          ) ||
                          (storeUrl.trim() && normalizeUrl(storeUrl) === proj.normalizedUrl);
                        const runIdsInProject = proj.runs.map((r) => r.id);
                        return (
                          <div
                            key={proj.normalizedUrl}
                            className={`group relative overflow-hidden rounded-xl border text-left transition ${
                              isActive
                                ? "border-violet-400/70 bg-violet-500/10"
                                : "border-white/10 bg-white/5 hover:bg-white/10"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 border-b border-white/10 p-3">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">
                                  {proj.title ? proj.title : proj.storeUrl}
                                </div>
                                <div className="mt-0.5 text-xs text-white/50">
                                  {isUniverse ? "Link to Ad" : "Classic"} · {proj.runs.length} generation
                                  {proj.runs.length > 1 ? "s" : ""}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="secondary"
                                  className="h-9 w-9 border border-cyan-400/35 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/30"
                                  title="Vue lab — carte des générations (zoom, branches)"
                                  onClick={() =>
                                    setProjectLab({
                                      title: proj.title ?? proj.storeUrl,
                                      storeUrl: proj.storeUrl,
                                      runs: proj.runs,
                                    })
                                  }
                                >
                                  <GitBranch className="h-4 w-4" strokeWidth={2.25} />
                                </Button>
                                {isUniverse ? (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="secondary"
                                    className="h-9 w-9 border border-violet-400/45 bg-violet-500/20 text-white hover:bg-violet-500/35"
                                    title="New ad — marketing angles"
                                    disabled={branchingNormalizedUrl === proj.normalizedUrl}
                                    onClick={() => void startNewLinkToAdFromProject(proj)}
                                  >
                                    {branchingNormalizedUrl === proj.normalizedUrl ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Plus className="h-5 w-5" strokeWidth={2.25} />
                                    )}
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="secondary"
                                  className="h-9 w-9 border border-white/15 bg-black/60 text-white/80 hover:bg-destructive/90 hover:text-white"
                                  title="Delete project"
                                  onClick={() =>
                                    setDeleteProjectDialog({
                                      storeUrl: proj.storeUrl,
                                      runIds: runIdsInProject,
                                      label: proj.title ? proj.title : proj.storeUrl,
                                    })
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex gap-2 overflow-x-auto p-2 pb-3 [-webkit-overflow-scrolling:touch]">
                              {proj.runs.map((run) => {
                                const runIsUniverse = runHasLinkToAdUniverse(run.extracted);
                                const prev = runGenerationPreview(run);
                                const runActive = runId === run.id || linkToAdResumeRunId === run.id;
                                return (
                                  <button
                                    key={run.id}
                                    type="button"
                                    onClick={() => {
                                      if (runIsUniverse) {
                                        setRunId(run.id);
                                        if (typeof localStorage !== "undefined") {
                                          localStorage.setItem(UGC_CURRENT_RUN_KEY, run.id);
                                        }
                                        setAppSectionNav("link_to_ad");
                                        setLinkToAdResumeRunId(run.id);
                                        return;
                                      }
                                      void loadRun(run.id);
                                    }}
                                    className={`flex w-[5.75rem] shrink-0 flex-col gap-1 rounded-lg border p-0.5 text-left transition ${
                                      runActive
                                        ? "border-violet-400/80 bg-violet-500/15"
                                        : "border-white/10 bg-black/25 hover:border-white/30"
                                    }`}
                                  >
                                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-[#100d17]">
                                      {prev?.kind === "image" ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={prev.url}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                      ) : prev?.kind === "video" ? (
                                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-violet-950/90 to-black">
                                          <Play className="h-7 w-7 text-white/75" fill="currentColor" />
                                        </div>
                                      ) : (
                                        <div className="flex h-full items-center justify-center text-[10px] text-white/35">
                                          Draft
                                        </div>
                                      )}
                                    </div>
                                    <span className="truncate px-0.5 text-center text-[10px] leading-tight text-white/50">
                                      {new Date(run.created_at).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            {isUniverse &&
                            proj.runs.some((r) => {
                              if (!runHasLinkToAdUniverse(r.extracted)) return false;
                              const u = readUniverseFromExtracted(r.extracted);
                              return Boolean(u?.summaryText?.trim() || u?.scriptsText?.trim());
                            }) ? (
                              <div className="space-y-2 border-t border-white/10 px-2 pb-3 pt-3">
                                <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                                  Generations — brand brief &amp; scripts
                                </p>
                                <p className="px-1 text-[10px] leading-snug text-white/40">
                                  Open a generation in Link to Ad, or edit the brand brief and UGC scripts here — each has
                                  its own save button.
                                </p>
                                {proj.runs.map((run) => {
                                  if (!runHasLinkToAdUniverse(run.extracted)) return null;
                                  const snap = readUniverseFromExtracted(run.extracted);
                                  if (!snap) return null;
                                  if (!snap.summaryText?.trim() && !snap.scriptsText?.trim()) return null;
                                  return (
                                    <details
                                      key={`universe-edit-${run.id}`}
                                      className="rounded-lg border border-white/10 bg-black/25 [&_summary::-webkit-details-marker]:hidden"
                                    >
                                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-white/75 hover:bg-white/[0.04] hover:text-white/90">
                                        <span>
                                          {new Date(run.created_at).toLocaleString(undefined, {
                                            dateStyle: "medium",
                                            timeStyle: "short",
                                          })}
                                        </span>
                                        <span className="shrink-0 text-[10px] font-normal text-violet-300/90">
                                          Show / edit brief &amp; scripts
                                        </span>
                                      </summary>
                                      <div className="border-t border-white/10 p-2">
                                        <ProjectRunBrandBriefEditor
                                          runId={run.id}
                                          storeUrl={run.store_url}
                                          title={run.title}
                                          extracted={run.extracted}
                                          summaryText={snap.summaryText}
                                          onSaved={() => void refreshMeAndRuns()}
                                        />
                                        {snap.scriptsText?.trim() ? (
                                          <ProjectRunScriptsEditor
                                            runId={run.id}
                                            storeUrl={run.store_url}
                                            title={run.title}
                                            extracted={run.extracted}
                                            scriptsText={snap.scriptsText}
                                            onSaved={() => void refreshMeAndRuns()}
                                          />
                                        ) : (
                                          <p className="text-[11px] text-white/40">
                                            Scripts not generated yet for this run — continue in Link to Ad or use
                                            Generate.
                                          </p>
                                        )}
                                      </div>
                                    </details>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {appSection === "motion_control" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className={`${
                      motionSubTab === "create" ? "bg-violet-400 text-black border border-violet-200/40" : "bg-white/5 text-white"
                    }`}
                    onClick={() => setMotionSubTab("create")}
                  >
                    Create Video
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className={`${
                      motionSubTab === "edit" ? "bg-violet-400 text-black border border-violet-200/40" : "bg-white/5 text-white"
                    }`}
                    onClick={() => setMotionSubTab("edit")}
                  >
                    Edit Video
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className={`${
                      motionSubTab === "control" ? "bg-violet-400 text-black border border-violet-200/40" : "bg-white/5 text-white"
                    }`}
                    onClick={() => setMotionSubTab("control")}
                  >
                    Motion Control
                  </Button>
                </div>

                {motionSubTab !== "control" ? (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
                    <aside className="flex min-w-0 flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0912]/85 p-4 lg:w-[min(100%,22rem)] lg:shrink-0">
                      <CardTitle className="text-base text-white">
                        {motionSubTab === "create" ? "Create Video" : "Edit Video"}
                      </CardTitle>
                      <p className="text-sm text-white/70">
                        This tab is UI-only for now. Use <span className="text-white/90 font-medium">Motion Control</span>{" "}
                        for the motion-reference workflow — parameters on the left, outputs on the right.
                      </p>
                    </aside>
                    <StudioOutputPane
                      title="Generations"
                      hasOutput={false}
                      output={<></>}
                      empty={<StudioEmptyExamples variant="video" />}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
                    <aside className="flex min-w-0 flex-col gap-4 lg:w-[min(100%,22rem)] xl:w-[min(100%,26rem)] lg:shrink-0 lg:max-h-[min(90vh,calc(100vh-10rem))] lg:overflow-y-auto lg:pr-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                        Motion control — parameters
                      </p>
                      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/15 to-transparent p-4">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
                            Motion control
                          </span>
                        </div>
                        <h2 className="mt-2 text-base font-bold tracking-tight text-white">
                          Video reference + character
                        </h2>
                        <p className="mt-1 text-xs text-white/55">
                          Short motion clip + clear character still. Outputs appear on the right.
                        </p>
                        <div className="relative mx-auto mt-3 aspect-[9/16] w-full max-w-[140px] overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                          {motionCharacterImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={motionCharacterImageUrl}
                              alt="Character"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center p-2 text-center">
                              <Play className="mb-1 h-8 w-8 text-violet-200/50" />
                              <span className="text-[10px] text-white/45">Character preview</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-400/20">
                            <Play className="h-4 w-4 text-violet-200" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white">Motion reference video</div>
                            <div className="text-xs text-white/55">Duration hint</div>
                          </div>
                        </div>
                        <div className="mt-3 space-y-3">
                          <div className="flex items-center justify-between text-xs text-white/55">
                            <span>3s</span>
                            <span className="font-medium text-white/75">{motionVideoDurationSeconds}s</span>
                            <span>30s</span>
                          </div>
                          <input
                            type="range"
                            min={3}
                            max={30}
                            step={1}
                            value={motionVideoDurationSeconds}
                            onChange={(e) => setMotionVideoDurationSeconds(Number(e.target.value))}
                            className="w-full accent-violet-300"
                          />
                          <input
                            ref={motionVideoInputRef}
                            type="file"
                            accept="video/*"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              if (!f) return;
                              setMotionVideoRefReady(true);
                              setMotionVideoRefFileName(f.name);
                              toast.success("Video reference selected", { description: f.name });
                              e.currentTarget.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
                            onClick={() => motionVideoInputRef.current?.click()}
                          >
                            {motionVideoRefReady ? "Change video reference" : "Choose video reference"}
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-sm font-semibold text-white">Character image</div>
                        <p className="mt-1 text-xs text-white/55">
                          Visible face and body (so motion control matches the character).
                        </p>
                        <div className="mt-3 flex flex-col gap-3">
                          <input
                            ref={motionCharacterInputRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              if (!f) return;
                              const url = URL.createObjectURL(f);
                              setMotionCharacterImageUrl(url);
                              toast.success("Character image selected", { description: f.name });
                              e.currentTarget.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
                            onClick={() => motionCharacterInputRef.current?.click()}
                          >
                            {motionCharacterImageUrl ? "Change character image" : "Choose character image"}
                          </Button>
                          {motionVideoRefReady ? (
                            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-200/90">
                              Video selected. Duration: {motionVideoDurationSeconds}s
                            </div>
                          ) : null}
                          {motionVideoRefReady && motionVideoRefFileName ? (
                            <div className="break-all text-xs text-white/45">Ref: {motionVideoRefFileName}</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div>
                          <span className="text-xs font-semibold text-white/80">Model</span>
                          <Select value={motionModel} onValueChange={(v) => setMotionModel(v)}>
                            <SelectTrigger className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="kling-3.0-motion-control">Kling 3.0 Motion Control</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-white/80">Quality</span>
                          <Select value={motionQuality} onValueChange={(v) => setMotionQuality(v)}>
                            <SelectTrigger className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="720p">720p</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-4">
                        <p className="text-xs text-white/55">
                          UI prototype (front-end only). Generation will be wired to APIs later.
                        </p>
                        <Button
                          type="button"
                          disabled={motionIsGenerating}
                          className="mt-3 w-full bg-violet-400 text-black border border-violet-200/40 shadow-[0_0_0_1px_rgba(76,29,149,0.3)] hover:bg-violet-300 h-12 rounded-2xl font-semibold inline-flex items-center justify-center gap-2"
                          onClick={async () => {
                            if (!motionCharacterImageUrl) {
                              toast.error("Please choose a character image first.");
                              return;
                            }
                            if (!motionVideoRefReady) {
                              toast.error("Please choose a video reference first.");
                              return;
                            }
                            if (motionIsGenerating) return;
                            setMotionIsGenerating(true);
                            try {
                              await new Promise((r) => setTimeout(r, 1200));
                              toast.success("Motion control generation queued (UI only)");
                            } finally {
                              setMotionIsGenerating(false);
                            }
                          }}
                        >
                          {motionIsGenerating ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Sparkles className="h-5 w-5" />
                          )}
                          Generate
                        </Button>
                      </div>
                    </aside>

                    <StudioOutputPane
                      title="Generations"
                      hasOutput={false}
                      output={<></>}
                      empty={<StudioEmptyExamples variant="motion" />}
                    />
                  </div>
                )}
              </div>
            ) : null}

            {appSection === "image" ? (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader>
                  <CardTitle className="text-base">Image</CardTitle>
                  <p className="text-sm text-white/50">
                    NanoBanana &amp; NanoBanana Pro — prompt, aspect ratio, resolution, batch size, reference images.
                  </p>
                </CardHeader>
                <CardContent>
                  <StudioImagePanel />
                </CardContent>
              </Card>
            ) : null}
            {appSection === "video" ? (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader>
                  <CardTitle className="text-base">Video</CardTitle>
                  <p className="text-sm text-white/50">
                    Kling 3.0, Seedance, Veo — frames, prompt, duration, aspect, audio.
                  </p>
                </CardHeader>
                <CardContent>
                  <StudioVideoPanel />
                </CardContent>
              </Card>
            ) : null}
            {appSection === "link_to_ad" ? (
              <LinkToAdUniverse
                resumeRunId={linkToAdResumeRunId}
                onResumeConsumed={() => setLinkToAdResumeRunId(null)}
                onRunsChanged={() => void refreshMeAndRuns()}
              />
            ) : null}

            {appSection === "link_to_ad" && false && step === "url" && (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
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
                        <div className="font-medium">{extracted?.title ?? "—"}</div>
                        <div className="text-sm text-muted-foreground">{extracted?.description ?? "—"}</div>
                        <div className="mt-2 text-xs text-muted-foreground break-all">{extracted?.url}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => setStep("analysis")} disabled={!extracted}>
                          Next → Analyse
                        </Button>
                      </div>
                      {extracted?.images?.length ? (
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            Images trouvées: <span className="font-medium">{extracted?.images?.length}</span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            {extracted?.images?.slice(0, 6).map((u) => (
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

            {appSection === "link_to_ad" && false && step === "analysis" && (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
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

            {appSection === "link_to_ad" && false && step === "quiz" && (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
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

            {appSection === "link_to_ad" && false && step === "image" && (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
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
                              type="button"
                              className={`rounded-md border overflow-hidden text-left transition cursor-pointer ${
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
                      <input
                        ref={packshotFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/*"
                        multiple
                        className="sr-only"
                        disabled={isUploadingPackshots}
                        onChange={(e) => {
                          onUploadPackshots(e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isUploadingPackshots}
                        onClick={() => packshotFileInputRef.current?.click()}
                        className="cursor-pointer"
                      >
                        {isUploadingPackshots ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Upload images
                      </Button>
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
                              type="button"
                              className="rounded-md border overflow-hidden cursor-pointer hover:opacity-90"
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
                    <div className="grid gap-4 sm:grid-cols-2">
                      {(imageGen as Extract<ImageGenState, { kind: "success" }>).urls.map((u) => (
                        <button
                          key={u}
                          type="button"
                          className={`rounded-xl border border-white/10 bg-black/30 text-left cursor-pointer hover:opacity-95 overflow-hidden ${
                            selectedImageUrl === u ? "ring-2 ring-violet-400" : ""
                          }`}
                          onClick={() => {
                            setSelectedImageUrl(u);
                            setLightboxUrl(u);
                          }}
                          title="Clique pour agrandir"
                        >
                          <div className="aspect-[9/16] w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={u}
                              alt="Generated"
                              className="h-full w-full object-contain object-center"
                            />
                          </div>
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
                      {(imageGen as Extract<ImageGenState, { kind: "error" }>).message}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {appSection === "link_to_ad" && false && step === "video" && (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader>
                  <CardTitle className="text-base">5) Template → vidéo (Kling 3.0 Standard)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                Provider: <span className="font-medium">Kling 3.0 Standard</span> (KIE Market), aspect 9:16. 15s, 720p
                Standard, audio ON (voix native).
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
                        Video: {(videoGen as Extract<VideoGenState, { kind: "success" }>).url}
                      </div>
                      <video
                        src={(videoGen as Extract<VideoGenState, { kind: "success" }>).url}
                        controls
                        playsInline
                        className="w-full rounded-md border bg-black"
                      />
                      {videoDownloadHref ? (
                        <Button asChild variant="secondary">
                        <a href={videoDownloadHref ?? undefined}>Download</a>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {videoGen.kind === "error" ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      {(videoGen as Extract<VideoGenState, { kind: "error" }>).message}
                    </div>
                  ) : null}

                  <div className="rounded-md border bg-background/30 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
                    <div className="font-medium text-sm mb-2">Debug context</div>
                    {JSON.stringify(
                      {
                        step,
                        extracted: extracted
                          ? {
                              url: extracted?.url,
                              title: extracted?.title,
                              images: extracted?.images?.slice(0, 3),
                              prices: extracted?.signals?.prices?.slice(0, 6),
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
        </section>
      </StudioShell>

      {deleteProjectDialog ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => !deleteProjectLoading && setDeleteProjectDialog(null)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            className="w-full max-w-md border-white/15 bg-[#0b0912] shadow-[0_0_60px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="space-y-1">
              <CardTitle id="delete-project-title" className="text-lg">
                Delete this project?
              </CardTitle>
              <p className="text-sm font-normal text-white/60">
                <span className="font-medium text-white/85">{deleteProjectDialog.label}</span>
                <br />
                All generations linked to this store URL will be removed permanently. This cannot be undone.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="border border-white/15 bg-white/5 text-white hover:bg-white/10"
                disabled={deleteProjectLoading}
                onClick={() => setDeleteProjectDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteProjectLoading}
                onClick={() =>
                  void executeDeleteProject(deleteProjectDialog.storeUrl, deleteProjectDialog.runIds)
                }
              >
                {deleteProjectLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete project"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {projectLab ? (
        <ProjectLabCanvas
          open
          onClose={() => setProjectLab(null)}
          projectTitle={projectLab.title}
          storeUrl={projectLab.storeUrl}
          runs={projectLab.runs}
          onOpenRunInEditor={(runId) => {
            setProjectLab(null);
            setRunId(runId);
            if (typeof localStorage !== "undefined") {
              localStorage.setItem(UGC_CURRENT_RUN_KEY, runId);
            }
            setAppSectionNav("link_to_ad");
            setLinkToAdResumeRunId(runId);
          }}
        />
      ) : null}

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
    </>
  );
}

