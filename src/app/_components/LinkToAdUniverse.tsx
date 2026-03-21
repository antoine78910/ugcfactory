"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Maximize2, Sparkles, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { absolutizeImageUrl } from "@/lib/imageUrl";
import { pickBestProductUrlForNanoBanana, productUrlsForGpt } from "@/lib/productReferenceImages";
import {
  cloneExtractedBase,
  deriveAngleLabelsFromScripts,
  parseThreeLabeledPrompts,
  readUniverseFromExtracted,
  selectedAngleScript,
  UNIVERSE_PIPELINE_CLEAR,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";
import { LinkToAdUniverseStepper } from "@/app/_components/LinkToAdUniverseStepper";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { WebsiteScanChecklist } from "@/app/_components/WebsiteScanChecklist";
import { WebsiteScanLoader } from "@/app/_components/WebsiteScanLoader";

export type LinkToAdUniverseProps = {
  /** When set, load this run once (e.g. from Projects). */
  resumeRunId?: string | null;
  onResumeConsumed?: () => void;
  /** Refresh Projects list after save. */
  onRunsChanged?: () => void;
};

function confidenceToQuality(c: string | undefined) {
  const v = String(c ?? "").toLowerCase();
  if (v === "high") return { label: "good", color: "text-emerald-400", help: "Clean product image looks strong." };
  if (v === "medium")
    return {
      label: "medium",
      color: "text-violet-300",
      help: "Image is usable but not perfect. Upload a neutral product-only photo for best results.",
    };
  return {
    label: "bad",
    color: "text-destructive",
    help: "Low confidence. Upload a neutral product-only photo (no background, no people) for best results.",
  };
}

function safeParseJson<T>(raw: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return { ok: false, error: "Invalid JSON from server." };
  }
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
    lower.includes("dialogue");
  if (mentionsAudio) return p;
  return `${p}\n\nAudio: ON. Include natural spoken voice and subtle ambient sound.`;
}

function storeHostname(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    const h = u.hostname.replace(/^www\./i, "");
    return h || null;
  } catch {
    return null;
  }
}

/** Public favicon proxy (no API key). */
function brandFaviconUrl(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}

/** Short teaser for UI only — full text stays in state for GPT / scripts APIs. */
function compactBrandSummaryForUi(full: string, maxLen = 200): string {
  const t = full.replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  let block = t.split(/\n\s*\n/)[0]?.trim() ?? t;
  block = block.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  if (block.length <= maxLen) return block;
  const cut = block.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 48 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

export default function LinkToAdUniverse({ resumeRunId, onResumeConsumed, onRunsChanged }: LinkToAdUniverseProps) {
  const [storeUrl, setStoreUrl] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [extractedTitle, setExtractedTitle] = useState<string | null>(null);

  const [cleanCandidate, setCleanCandidate] = useState<{ url: string; reason?: string } | null>(null);
  const [fallbackImageUrl, setFallbackImageUrl] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [neutralUploadUrl, setNeutralUploadUrl] = useState<string | null>(null);
  /** URLs classified as product-only (multi-angle); used for GPT vision + Nano single pick. */
  const [productOnlyImageUrls, setProductOnlyImageUrls] = useState<string[]>([]);
  const [imgError, setImgError] = useState(false);
  const [brandFaviconFailed, setBrandFaviconFailed] = useState(false);
  /** After user clicks "Generate video from this image", show video prompt + output panels (incl. errors). */
  const [userStartedVideoFromImage, setUserStartedVideoFromImage] = useState(false);

  const [summaryText, setSummaryText] = useState<string>("");
  const [scriptsText, setScriptsText] = useState<string>("");
  const [stage, setStage] = useState<
    | "idle"
    | "scanning"
    | "finding_image"
    | "summarizing"
    | "writing_scripts"
    | "server_pipeline"
    | "ready"
    | "error"
  >("idle");

  const [universeRunId, setUniverseRunId] = useState<string | null>(null);
  const [lastExtractedJson, setLastExtractedJson] = useState<Record<string, unknown> | null>(null);
  const [angleLabels, setAngleLabels] = useState<[string, string, string]>(["", "", ""]);
  const [selectedAngleIndex, setSelectedAngleIndex] = useState<number | null>(null);

  const [nanoBananaPromptsRaw, setNanoBananaPromptsRaw] = useState("");
  const [nanoBananaSelectedPromptIndex, setNanoBananaSelectedPromptIndex] = useState<0 | 1 | 2>(0);
  const [nanoBananaTaskId, setNanoBananaTaskId] = useState<string | null>(null);
  const [nanoBananaImageUrl, setNanoBananaImageUrl] = useState<string | null>(null);
  const [nanoBananaImageUrls, setNanoBananaImageUrls] = useState<string[]>([]);
  const [nanoBananaSelectedImageIndex, setNanoBananaSelectedImageIndex] = useState<0 | 1 | 2 | null>(null);
  const [ugcVideoPromptGpt, setUgcVideoPromptGpt] = useState("");
  const [klingTaskId, setKlingTaskId] = useState<string | null>(null);
  const [klingVideoUrl, setKlingVideoUrl] = useState<string | null>(null);

  const [isNanoPromptsLoading, setIsNanoPromptsLoading] = useState(false);
  const [isNanoImageSubmitting, setIsNanoImageSubmitting] = useState(false);
  const [nanoPollTaskId, setNanoPollTaskId] = useState<string | null>(null);
  const [isNanoAllImagesSubmitting, setIsNanoAllImagesSubmitting] = useState(false);
  const [isVideoPromptLoading, setIsVideoPromptLoading] = useState(false);
  const [isKlingSubmitting, setIsKlingSubmitting] = useState(false);
  const [klingPollTaskId, setKlingPollTaskId] = useState<string | null>(null);
  /** Lightbox: full reference image (source is often 9:16; grid shows 3:4 crop). */
  const [nanoImageLightboxUrl, setNanoImageLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevAngleRef = useRef<number | null>(null);
  const summaryTextRef = useRef("");
  const isWorkingRef = useRef(false);
  const autoContinueScriptsFiredRef = useRef(false);
  const nanoAutoGenKeyRef = useRef<string>("");
  const latestSnapRef = useRef<LinkToAdUniverseSnapshotV1 | null>(null);
  /** Prompt string sent for the current image task (for accurate persist after poll). */
  const lastNanoImagePromptRef = useRef("");
  const lastNanoImagePromptIndexRef = useRef<0 | 1 | 2>(0);
  const lastKlingVideoPromptRef = useRef("");
  /** Avoid infinite resume loop if KIE poll fails after returning to the page. */
  const klingResumeAttemptedRef = useRef(false);

  useEffect(() => {
    latestSnapRef.current = {
      v: 1,
      phase: scriptsText ? "after_scripts" : "after_summary",
      cleanCandidate,
      fallbackImageUrl,
      confidence,
      neutralUploadUrl,
      productOnlyImageUrls: productOnlyImageUrls.length ? productOnlyImageUrls : undefined,
      summaryText,
      scriptsText,
      angleLabels,
      selectedAngleIndex,
      nanoBananaPromptsRaw: nanoBananaPromptsRaw || undefined,
      nanoBananaSelectedPromptIndex,
      nanoBananaTaskId: nanoBananaTaskId ?? undefined,
      nanoBananaImageUrl: nanoBananaImageUrl ?? undefined,
      nanoBananaImageUrls: nanoBananaImageUrls.length ? nanoBananaImageUrls : undefined,
      nanoBananaSelectedImageIndex: nanoBananaSelectedImageIndex ?? undefined,
      ugcVideoPromptGpt: ugcVideoPromptGpt || undefined,
      klingTaskId: klingTaskId ?? undefined,
      klingVideoUrl: klingVideoUrl ?? undefined,
    };
  }, [
    cleanCandidate,
    fallbackImageUrl,
    confidence,
    neutralUploadUrl,
    productOnlyImageUrls,
    summaryText,
    scriptsText,
    angleLabels,
    selectedAngleIndex,
    nanoBananaPromptsRaw,
    nanoBananaSelectedPromptIndex,
    nanoBananaTaskId,
    nanoBananaImageUrl,
    nanoBananaImageUrls,
    nanoBananaSelectedImageIndex,
    ugcVideoPromptGpt,
    klingTaskId,
    klingVideoUrl,
  ]);

  const quality = useMemo(() => confidenceToQuality(confidence ?? undefined), [confidence]);
  const parsedNanoPrompts = useMemo(() => parseThreeLabeledPrompts(nanoBananaPromptsRaw), [nanoBananaPromptsRaw]);
  const displayedProductImageUrl = neutralUploadUrl ?? cleanCandidate?.url ?? fallbackImageUrl ?? null;

  const resolvedPreviewUrl = useMemo(() => {
    if (!displayedProductImageUrl) return null;
    if (/^https?:\/\//i.test(displayedProductImageUrl)) return displayedProductImageUrl;
    const base = storeUrl.trim();
    if (!base) return displayedProductImageUrl;
    return absolutizeImageUrl(displayedProductImageUrl, base) ?? displayedProductImageUrl;
  }, [displayedProductImageUrl, storeUrl]);

  useEffect(() => {
    setImgError(false);
  }, [resolvedPreviewUrl]);

  useEffect(() => {
    if (!nanoImageLightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNanoImageLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nanoImageLightboxUrl]);

  useEffect(() => {
    summaryTextRef.current = summaryText;
  }, [summaryText]);

  useEffect(() => {
    isWorkingRef.current = isWorking;
  }, [isWorking]);

  const hydrateFromRun = useCallback(
    (
      run: {
        id: string;
        store_url?: string | null;
        title?: string | null;
        extracted?: unknown;
      },
      opts?: { silent?: boolean },
    ) => {
      const snap = readUniverseFromExtracted(run.extracted);
      if (!snap) {
        toast.error("This run has no Link to Ad Universe data.");
        return;
      }
      setUniverseRunId(run.id);
      setStoreUrl(typeof run.store_url === "string" ? run.store_url : "");
      setExtractedTitle(typeof run.title === "string" ? run.title : null);
      setCleanCandidate(snap.cleanCandidate);
      setFallbackImageUrl(snap.fallbackImageUrl);
      setConfidence(snap.confidence);
      setNeutralUploadUrl(snap.neutralUploadUrl);
      setProductOnlyImageUrls(
        snap.productOnlyImageUrls && snap.productOnlyImageUrls.length > 0
          ? snap.productOnlyImageUrls
          : snap.cleanCandidate?.url
            ? [snap.cleanCandidate.url]
            : [],
      );
      setSummaryText(snap.summaryText);
      setScriptsText(snap.scriptsText);
      setAngleLabels(
        snap.angleLabels[0] && snap.angleLabels[1] && snap.angleLabels[2]
          ? snap.angleLabels
          : snap.scriptsText
            ? deriveAngleLabelsFromScripts(snap.scriptsText)
            : ["", "", ""],
      );
      setSelectedAngleIndex(snap.selectedAngleIndex);
      setNanoBananaPromptsRaw(snap.nanoBananaPromptsRaw ?? "");
      setNanoBananaSelectedPromptIndex(
        snap.nanoBananaSelectedPromptIndex === 0 || snap.nanoBananaSelectedPromptIndex === 1 || snap.nanoBananaSelectedPromptIndex === 2
          ? snap.nanoBananaSelectedPromptIndex
          : 0,
      );
      setNanoBananaTaskId(snap.nanoBananaTaskId ?? null);
      setNanoBananaImageUrl(snap.nanoBananaImageUrl ?? null);
      setNanoBananaImageUrls(Array.isArray(snap.nanoBananaImageUrls) ? snap.nanoBananaImageUrls : []);
      setNanoBananaSelectedImageIndex(
        snap.nanoBananaSelectedImageIndex === 0 || snap.nanoBananaSelectedImageIndex === 1 || snap.nanoBananaSelectedImageIndex === 2
          ? snap.nanoBananaSelectedImageIndex
          : null,
      );
      setUgcVideoPromptGpt(snap.ugcVideoPromptGpt ?? "");
      setKlingTaskId(snap.klingTaskId ?? null);
      setKlingVideoUrl(snap.klingVideoUrl ?? null);
      setNanoPollTaskId(null);
      setKlingPollTaskId(null);
      setUserStartedVideoFromImage(
        Boolean(
          (snap.ugcVideoPromptGpt && snap.ugcVideoPromptGpt.trim()) ||
            (snap.klingVideoUrl && snap.klingVideoUrl.trim()),
        ),
      );
      prevAngleRef.current = snap.selectedAngleIndex;
      setLastExtractedJson(cloneExtractedBase(run.extracted));
      setStage("ready");
      setImgError(false);
      if (!opts?.silent) {
        toast.success("Project resumed");
      }
    },
    [],
  );

  useEffect(() => {
    if (!resumeRunId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/runs/get?runId=${encodeURIComponent(resumeRunId)}`, { cache: "no-store" });
        const json = (await res.json()) as { data?: { id: string; store_url?: string; title?: string | null; extracted?: unknown }; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error || "Load failed");
        if (!cancelled) hydrateFromRun(json.data);
      } catch (e) {
        toast.error("Unable to load the project", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      } finally {
        if (!cancelled) onResumeConsumed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeRunId, onResumeConsumed, hydrateFromRun]);

  type RunExtras = {
    imagePrompt?: string;
    selectedImageUrl?: string | null;
    generatedImageUrls?: string[];
    videoPrompt?: string;
    videoUrl?: string | null;
  };

  const persistUniverse = useCallback(
    async (
      runId: string | null,
      url: string,
      title: string | null,
      extractedBase: Record<string, unknown>,
      snapshot: LinkToAdUniverseSnapshotV1,
      packshotUrls: string[],
      extras?: RunExtras,
    ): Promise<string> => {
      const extracted = { ...extractedBase, __universe: snapshot };
      const res = await fetch("/api/runs/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: runId ?? undefined,
          storeUrl: url,
          title,
          extracted,
          packshotUrls: packshotUrls.length ? packshotUrls.slice(0, 12) : undefined,
          ...(extras?.imagePrompt !== undefined ? { imagePrompt: extras.imagePrompt } : {}),
          ...(extras?.selectedImageUrl !== undefined ? { selectedImageUrl: extras.selectedImageUrl } : {}),
          ...(extras?.generatedImageUrls !== undefined ? { generatedImageUrls: extras.generatedImageUrls } : {}),
          ...(extras?.videoPrompt !== undefined ? { videoPrompt: extras.videoPrompt } : {}),
          ...(extras?.videoUrl !== undefined ? { videoUrl: extras.videoUrl } : {}),
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error || "Save failed");
      setUniverseRunId(json.runId);
      onRunsChanged?.();
      return json.runId;
    },
    [onRunsChanged],
  );

  async function uploadNeutralPhoto(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];

    setIsWorking(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const raw = await res.text();
      const parsed = safeParseJson<{ url?: string; error?: string }>(raw);
      if (!res.ok || !parsed.ok) {
        throw new Error(parsed.ok ? parsed.value.error || `Upload failed (${res.status})` : parsed.error);
      }
      if (!parsed.value.url) throw new Error(parsed.value.error || "Upload failed: missing url");
      setNeutralUploadUrl(parsed.value.url);
      toast.success("Neutral product photo uploaded");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error("Upload error", { description: message });
    } finally {
      setIsWorking(false);
    }
  }

  async function onSelectAngle(index: 0 | 1 | 2) {
    const url = storeUrl.trim();
    if (!url || !lastExtractedJson) return;

    const prev = prevAngleRef.current;
    const angleChanged = prev !== null && prev !== index;
    prevAngleRef.current = index;
    setSelectedAngleIndex(index);

    if (angleChanged) {
      setNanoBananaPromptsRaw("");
      setNanoBananaSelectedPromptIndex(0);
      setNanoBananaTaskId(null);
      setNanoBananaImageUrl(null);
      setNanoBananaImageUrls([]);
      setNanoBananaSelectedImageIndex(null);
      setUgcVideoPromptGpt("");
      setKlingTaskId(null);
      setKlingVideoUrl(null);
      setNanoPollTaskId(null);
      setKlingPollTaskId(null);
      setUserStartedVideoFromImage(false);
    }

    const base = latestSnapRef.current;
    if (!base) return;
    const snap: LinkToAdUniverseSnapshotV1 = {
      ...base,
      selectedAngleIndex: index,
      ...(angleChanged ? UNIVERSE_PIPELINE_CLEAR : {}),
    };
    try {
      await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave());
    } catch {
      /* ignore */
    }
  }

  function packshotsForSave(): string[] {
    const pageUrl = storeUrl.trim();
    if (!pageUrl) {
      const u = resolvedPreviewUrl;
      return u && /^https?:\/\//i.test(u) ? [u] : [];
    }
    const candidates =
      productOnlyImageUrls.length > 0
        ? productOnlyImageUrls
        : cleanCandidate?.url
          ? [cleanCandidate.url]
          : [];
    const gpt = productUrlsForGpt({
      pageUrl,
      neutralUploadUrl,
      candidateUrls: candidates,
      fallbackUrl: fallbackImageUrl,
    });
    if (gpt.length > 0) return gpt;
    const u = resolvedPreviewUrl;
    return u && /^https?:\/\//i.test(u) ? [u] : [];
  }

  /** Resume after a save stopped at brand brief (scripts step failed or interrupted). Runs on the server so navigation does not cancel it. */
  async function onContinueScripts() {
    const url = storeUrl.trim();
    if (!url || !lastExtractedJson || !summaryText.trim()) {
      toast.error("Incomplete data to generate scripts.");
      return;
    }
    if (!universeRunId) {
      toast.error("No saved project yet — run Generate from URL first.");
      return;
    }

    setIsWorking(true);
    setStage("writing_scripts");
    try {
      const res = await fetch("/api/link-to-ad/continue-scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: universeRunId }),
      });
      const json = (await res.json()) as { runId?: string; error?: string; scriptsStepOk?: boolean };
      if (!res.ok || !json.runId) {
        throw new Error(json.error || "Continue scripts failed");
      }
      const getRes = await fetch(`/api/runs/get?runId=${encodeURIComponent(json.runId)}`, { cache: "no-store" });
      const getJson = (await getRes.json()) as {
        data?: { id: string; store_url?: string | null; title?: string | null; extracted?: unknown };
        error?: string;
      };
      if (!getRes.ok || !getJson.data) {
        throw new Error(getJson.error || "Could not reload project");
      }
      hydrateFromRun(getJson.data, { silent: true });
      setStage("ready");
      toast.success("3 UGC scripts ready");
      onRunsChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scripts step failed";
      toast.warning("Script generation failed", { description: msg });
      setStage("ready");
    } finally {
      setIsWorking(false);
    }
  }

  async function onRun(opts?: { bypassSavedProject?: boolean }) {
    const url = storeUrl.trim();
    if (!url) {
      toast.error("Missing URL");
      return;
    }

    /** Refaire l’étape 1 : ne pas réutiliser l’upload neutre (l’UI doit se vider comme le brief). */
    const userUploadedImageUrl = opts?.bypassSavedProject ? null : neutralUploadUrl;

    /** Saved run for this URL hydrates in place unless bypass (redo step 1). */
    const tryHydrateFromSavedRun = !opts?.bypassSavedProject;

    // Loader + barre de statut dès le clic (avant find-by-url, qui était sans isWorking).
    setIsWorking(true);
    setStage("scanning");

    if (tryHydrateFromSavedRun) {
      try {
        const findRes = await fetch(`/api/runs/find-by-store-url?url=${encodeURIComponent(url)}`, { cache: "no-store" });
        const findJson = (await findRes.json()) as { data?: { id: string; store_url?: string; title?: string | null; extracted?: unknown } };
        if (findRes.ok && findJson.data) {
          const snap = readUniverseFromExtracted(findJson.data.extracted);
          if (snap) {
            hydrateFromRun(findJson.data);
            setStage("ready");
            setIsWorking(false);
            return;
          }
        }
      } catch {
        /* continue fresh scan */
      }
    }

    setSummaryText("");
    setScriptsText("");
    setAngleLabels(["", "", ""]);
    setSelectedAngleIndex(null);
    if (opts?.bypassSavedProject) {
      setNeutralUploadUrl(null);
    }
    setUniverseRunId(null);
    setLastExtractedJson(null);
    setExtractedTitle(null);
    setCleanCandidate(null);
    setFallbackImageUrl(null);
    setConfidence(null);
    setProductOnlyImageUrls([]);
    setImgError(false);
    setNanoBananaPromptsRaw("");
    setNanoBananaSelectedPromptIndex(0);
    setNanoBananaTaskId(null);
    setNanoBananaImageUrl(null);
    setNanoBananaImageUrls([]);
    setNanoBananaSelectedImageIndex(null);
    setUgcVideoPromptGpt("");
    setKlingTaskId(null);
    setKlingVideoUrl(null);
    setNanoPollTaskId(null);
    setKlingPollTaskId(null);
    setUserStartedVideoFromImage(false);
    prevAngleRef.current = null;

    try {
      setStage("server_pipeline");
      const pipeRes = await fetch("/api/link-to-ad/initial-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeUrl: url,
          neutralUploadUrl: userUploadedImageUrl,
        }),
      });
      const pipeJson = (await pipeRes.json()) as {
        runId?: string;
        scriptsStepOk?: boolean;
        scriptsError?: string;
        error?: string;
      };

      if (!pipeRes.ok || !pipeJson.runId) {
        if (pipeJson.runId) {
          const getRes = await fetch(`/api/runs/get?runId=${encodeURIComponent(pipeJson.runId)}`, { cache: "no-store" });
          const getJson = (await getRes.json()) as {
            data?: { id: string; store_url?: string | null; title?: string | null; extracted?: unknown };
            error?: string;
          };
          if (getRes.ok && getJson.data) {
            hydrateFromRun(getJson.data, { silent: true });
            toast.message("Pipeline stopped early", {
              description: pipeJson.error || "Partial data was saved — check your project.",
            });
            setStage("ready");
            onRunsChanged?.();
            return;
          }
        }
        throw new Error(pipeJson.error || "Initial pipeline failed");
      }

      const getRes = await fetch(`/api/runs/get?runId=${encodeURIComponent(pipeJson.runId)}`, { cache: "no-store" });
      const getJson = (await getRes.json()) as {
        data?: { id: string; store_url?: string | null; title?: string | null; extracted?: unknown };
        error?: string;
      };
      if (!getRes.ok || !getJson.data) {
        throw new Error(getJson.error || "Could not reload project after pipeline");
      }
      hydrateFromRun(getJson.data, { silent: true });
      setStage("ready");
      toast.success("Project saved");
      if (pipeJson.scriptsStepOk) {
        toast.success("3 UGC scripts ready");
      } else if (pipeJson.scriptsError) {
        toast.warning("Scripts step failed", { description: pipeJson.scriptsError });
      }
      onRunsChanged?.();
    } catch (err) {
      setStage("error");
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error("Universe error", { description: message });
    } finally {
      setIsWorking(false);
    }
  }

  async function onGenerateNanoBananaPrompts(angleIdx?: 0 | 1 | 2 | null) {
    const url = storeUrl.trim();
    const idx = angleIdx !== undefined && angleIdx !== null ? angleIdx : selectedAngleIndex;
    const script = selectedAngleScript(scriptsText, idx);
    const candidates =
      productOnlyImageUrls.length > 0
        ? productOnlyImageUrls
        : cleanCandidate?.url
          ? [cleanCandidate.url]
          : [];
    const img = pickBestProductUrlForNanoBanana({
      pageUrl: url,
      neutralUploadUrl,
      candidateUrls: candidates,
      fallbackUrl: fallbackImageUrl,
    });
    if (!url || !lastExtractedJson || idx === null || !script.trim()) {
      toast.error("Pick an angle and make sure the script is ready.");
      return;
    }
    if (!img || !/^https?:\/\//i.test(img)) {
      toast.error("HTTPS product image is required (missing preview or relative URL).");
      return;
    }
    setIsNanoPromptsLoading(true);
    setIsNanoAllImagesSubmitting(false);
    let text = "";
    try {
      const res = await fetch("/api/gpt/nanobanana-ugc-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketingScript: script, productImageUrl: img }),
      });
      const json = (await res.json()) as { data?: string; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Image prompts failed");
      text = String(json.data);
      setNanoBananaPromptsRaw(text);
      setNanoBananaSelectedPromptIndex(0);
      setNanoBananaImageUrl(null);
      setNanoBananaImageUrls([]);
      setNanoBananaSelectedImageIndex(null);
      const base = latestSnapRef.current;
      if (base && lastExtractedJson) {
        const snap: LinkToAdUniverseSnapshotV1 = {
          ...base,
          nanoBananaPromptsRaw: text,
          nanoBananaSelectedPromptIndex: 0,
          nanoBananaTaskId: null,
          nanoBananaImageUrl: null,
          nanoBananaImageUrls: undefined,
          nanoBananaSelectedImageIndex: null,
          ugcVideoPromptGpt: undefined,
          klingTaskId: null,
          klingVideoUrl: null,
        };
        await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
          imagePrompt: text,
        });
      }
      toast.success("3 image prompts saved — starting generation…");

      const rawTri = parseThreeLabeledPrompts(text);
      const prompts: [string, string, string] = [rawTri[0].trim(), rawTri[1].trim(), rawTri[2].trim()];
      if (!prompts[0] || !prompts[1] || !prompts[2]) {
        toast.warning("Prompts saved", {
          description: "Could not parse all 3 prompts — use Regenerate if needed.",
        });
        return;
      }

      setIsNanoAllImagesSubmitting(true);
      try {
        const { urlsByPrompt, lastTaskId } = await runNanoBananaProThreeSequential(img, prompts);
        if (!urlsByPrompt[0] || !urlsByPrompt[1] || !urlsByPrompt[2]) {
          throw new Error("Image generation did not return 3 images.");
        }
        await persistNanoThreeGeneratedImages(url, prompts, urlsByPrompt, lastTaskId);
        toast.success("3 reference images ready");
      } catch (imgErr) {
        toast.error("Image generation", {
          description:
            (imgErr instanceof Error ? imgErr.message : "Unknown error") +
            " — Prompts are saved; you can retry.",
        });
      } finally {
        setIsNanoAllImagesSubmitting(false);
      }
    } catch (e) {
      toast.error("Image prompts", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setIsNanoPromptsLoading(false);
    }
  }

  async function onGenerateNanoBananaImage() {
    const url = storeUrl.trim();
    const candidates =
      productOnlyImageUrls.length > 0
        ? productOnlyImageUrls
        : cleanCandidate?.url
          ? [cleanCandidate.url]
          : [];
    const img = pickBestProductUrlForNanoBanana({
      pageUrl: url,
      neutralUploadUrl,
      candidateUrls: candidates,
      fallbackUrl: fallbackImageUrl,
    });
    const prompt = parsedNanoPrompts[nanoBananaSelectedPromptIndex]?.trim();
    if (!url || !lastExtractedJson || !prompt) {
      toast.error("Generate the 3 image prompts first, then choose a valid prompt.");
      return;
    }
    if (!img || !/^https?:\/\//i.test(img)) {
      toast.error("Product image missing or not HTTPS.");
      return;
    }
    setIsNanoImageSubmitting(true);
    lastNanoImagePromptRef.current = prompt;
    lastNanoImagePromptIndexRef.current = nanoBananaSelectedPromptIndex;
    try {
      const res = await fetch("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "pro",
          prompt,
          imageUrls: [img],
          resolution: "2K",
          aspectRatio: "9:16",
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Image generation failed");
      setNanoBananaTaskId(json.taskId);
      setNanoPollTaskId(json.taskId);
      const base = latestSnapRef.current;
      if (base && lastExtractedJson) {
        const snap: LinkToAdUniverseSnapshotV1 = {
          ...base,
          nanoBananaTaskId: json.taskId,
          nanoBananaImageUrl: null,
          nanoBananaImageUrls: undefined,
          nanoBananaSelectedImageIndex: null,
        };
        await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
          imagePrompt: prompt,
        });
      }
      toast.success("Image generation started");
    } catch (e) {
      toast.error("Image generation", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsNanoImageSubmitting(false);
    }
  }

  async function pollNanoBananaTaskForUrls(taskId: string): Promise<string[]> {
    // Poll NanoBanana task until successFlag indicates completion.
    // We keep it simple for pro image generation: take the first URL from the response.
    const sleepMs = 4000;
    // ~12 minutes max wait (enough for most generations).
    const maxAttempts = Math.ceil((12 * 60 * 1000) / sleepMs);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json()) as any;
      if (!res.ok || !json.data) throw new Error(json.error || "Generation status check failed");
      const s = json.data.successFlag ?? 0;
      if (s === 0) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }
      if (s === 1) {
        const resp = json.data.response ?? {};
        const candidates: unknown[] = [
          (resp as { resultImageUrl?: unknown }).resultImageUrl,
          (resp as { resultUrls?: unknown }).resultUrls,
          (resp as { resultUrl?: unknown }).resultUrl,
          (resp as { result_url?: unknown }).result_url,
          (resp as { resultImageUrls?: unknown }).resultImageUrls,
        ];
        const urls = candidates.flatMap((v) => {
          if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
          if (typeof v === "string") return [v];
          return [];
        });
        if (!urls.length) throw new Error("Generation finished but image URLs are missing.");
        return urls;
      }
      throw new Error(json.data.errorMessage || `Generation failed (successFlag=${String(s)})`);
    }
    throw new Error("Image generation timed out.");
  }

  /** Run 3 NanoBanana Pro jobs sequentially; returns URLs in prompt order. */
  async function runNanoBananaProThreeSequential(
    img: string,
    prompts: [string, string, string],
  ): Promise<{ urlsByPrompt: string[]; lastTaskId: string | null }> {
    const urlsByPrompt: string[] = [];
    let lastTaskId: string | null = null;
    for (let i = 0; i < 3; i++) {
      const prompt = prompts[i];
      lastNanoImagePromptRef.current = prompt;
      lastNanoImagePromptIndexRef.current = i as 0 | 1 | 2;
      const res = await fetch("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "pro",
          prompt,
          imageUrls: [img],
          resolution: "2K",
          aspectRatio: "9:16",
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Image generation failed");
      lastTaskId = json.taskId;
      const urls = await pollNanoBananaTaskForUrls(json.taskId);
      urlsByPrompt[i] = urls[0];
    }
    return { urlsByPrompt, lastTaskId };
  }

  async function persistNanoThreeGeneratedImages(
    url: string,
    prompts: [string, string, string],
    urlsByPrompt: string[],
    lastTaskId: string | null,
  ) {
    setNanoBananaImageUrls(urlsByPrompt);
    setNanoBananaSelectedImageIndex(null);
    setNanoBananaSelectedPromptIndex(0);
    setNanoBananaTaskId(lastTaskId);
    setNanoBananaImageUrl(null);
    setUgcVideoPromptGpt("");
    setKlingVideoUrl(null);
    setKlingTaskId(null);
    setKlingPollTaskId(null);
    setUserStartedVideoFromImage(false);
    const base = latestSnapRef.current;
    if (base && lastExtractedJson) {
      const snap: LinkToAdUniverseSnapshotV1 = {
        ...base,
        nanoBananaTaskId: lastTaskId,
        nanoBananaImageUrl: null,
        nanoBananaImageUrls: urlsByPrompt,
        nanoBananaSelectedImageIndex: null,
        nanoBananaSelectedPromptIndex: 0,
        ugcVideoPromptGpt: undefined,
        klingTaskId: null,
        klingVideoUrl: null,
      };
      await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
        selectedImageUrl: null,
        generatedImageUrls: urlsByPrompt,
        videoPrompt: "",
        videoUrl: null,
      });
    }
  }

  async function onGenerateNanoBananaImagesFromAllPrompts() {
    const url = storeUrl.trim();
    const candidates =
      productOnlyImageUrls.length > 0
        ? productOnlyImageUrls
        : cleanCandidate?.url
          ? [cleanCandidate.url]
          : [];
    const img = pickBestProductUrlForNanoBanana({
      pageUrl: url,
      neutralUploadUrl,
      candidateUrls: candidates,
      fallbackUrl: fallbackImageUrl,
    });
    if (!url || !lastExtractedJson || selectedAngleIndex === null) {
      toast.error("Project not ready to generate images.");
      return;
    }
    if (!img || !/^https?:\/\//i.test(img)) {
      toast.error("HTTPS product image is required to generate images.");
      return;
    }
    if (!nanoBananaPromptsRaw.trim()) {
      toast.error("Generate the 3 image prompts first.");
      return;
    }
    const prompts = parsedNanoPrompts.map((p) => p.trim());
    if (!prompts[0] || !prompts[1] || !prompts[2]) {
      toast.error("Some image prompts are missing.");
      return;
    }

    setIsNanoAllImagesSubmitting(true);
    try {
      const { urlsByPrompt, lastTaskId } = await runNanoBananaProThreeSequential(img, prompts as [string, string, string]);

      if (!urlsByPrompt[0] || !urlsByPrompt[1] || !urlsByPrompt[2]) {
        throw new Error("Image generation did not produce 3 images.");
      }

      await persistNanoThreeGeneratedImages(url, prompts as [string, string, string], urlsByPrompt, lastTaskId);

      toast.success("3 images generated");
    } catch (e) {
      toast.error("Image generation", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsNanoAllImagesSubmitting(false);
    }
  }

  async function onSelectNanoBananaImage(idx: 0 | 1 | 2) {
    const url = storeUrl.trim();
    if (!url || !lastExtractedJson) return;
    if (!nanoBananaImageUrls[idx]) return;
    const selectedUrl = nanoBananaImageUrls[idx];
    const prompt = parsedNanoPrompts[idx]?.trim() || "";

    setUgcVideoPromptGpt("");
    setKlingVideoUrl(null);
    setKlingTaskId(null);
    setKlingPollTaskId(null);
    setUserStartedVideoFromImage(false);

    setNanoBananaSelectedImageIndex(idx);
    setNanoBananaSelectedPromptIndex(idx);
    setNanoBananaImageUrl(selectedUrl);
    lastNanoImagePromptRef.current = prompt;
    lastNanoImagePromptIndexRef.current = idx;

    const base = latestSnapRef.current;
    if (!base) return;
    const snap: LinkToAdUniverseSnapshotV1 = {
      ...base,
      nanoBananaSelectedImageIndex: idx,
      nanoBananaSelectedPromptIndex: idx,
      nanoBananaImageUrl: selectedUrl,
      nanoBananaImageUrls: nanoBananaImageUrls,
    };
    try {
      await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
        imagePrompt: prompt || undefined,
        selectedImageUrl: selectedUrl,
        generatedImageUrls: nanoBananaImageUrls,
      });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!nanoPollTaskId) return;
    const taskId = nanoPollTaskId;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const json = (await res.json()) as {
          data?: { successFlag?: number; response?: Record<string, unknown>; errorMessage?: string };
          error?: string;
        };
        if (!res.ok || !json.data) throw new Error(json.error || "Poll failed");
        if (cancelled) return;
        const s = json.data.successFlag ?? 0;
        if (s === 0) return;
        if (s === 1) {
          const resp = json.data.response ?? {};
          const candidates: unknown[] = [
            (resp as { resultImageUrl?: unknown }).resultImageUrl,
            (resp as { resultUrls?: unknown }).resultUrls,
            (resp as { resultUrl?: unknown }).resultUrl,
            (resp as { result_url?: unknown }).result_url,
            (resp as { resultImageUrls?: unknown }).resultImageUrls,
          ];
          const urls = candidates.flatMap((v) => {
            if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
            if (typeof v === "string") return [v];
            return [];
          });
          if (!urls.length) throw new Error("Image ready but URL missing.");
          const first = urls[0];
          setNanoBananaImageUrl(first);
          setNanoBananaImageUrls([first]);
          setNanoBananaSelectedImageIndex(lastNanoImagePromptIndexRef.current);
          setNanoPollTaskId(null);
          const url0 = storeUrl.trim();
          const base = latestSnapRef.current;
          if (base && lastExtractedJson && url0) {
            const chosen = lastNanoImagePromptRef.current.trim();
            const snap: LinkToAdUniverseSnapshotV1 = {
              ...base,
              nanoBananaImageUrl: first,
              nanoBananaImageUrls: [first],
              nanoBananaSelectedImageIndex: lastNanoImagePromptIndexRef.current,
              nanoBananaTaskId: taskId,
            };
            try {
              await persistUniverse(universeRunId, url0, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
                imagePrompt: chosen || undefined,
                selectedImageUrl: first,
                generatedImageUrls: urls.slice(0, 8),
              });
            } catch (e) {
              toast.error("Save failed", {
                description: e instanceof Error ? e.message : "Unknown error",
              });
            }
          }
          toast.success("Image saved");
          if (interval) clearInterval(interval);
          interval = null;
          return;
        }
        throw new Error(json.data.errorMessage || `Image generation failed: ${String(s)}`);
      } catch (err) {
        if (cancelled) return;
        toast.error("Image generation", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        setNanoPollTaskId(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick uses latest closure via refs where needed
  }, [nanoPollTaskId]);

  async function onGenerateUgcVideoPrompt(): Promise<string | null> {
    const url = storeUrl.trim();
    const script = selectedAngleScript(scriptsText, selectedAngleIndex);
    if (!url || !lastExtractedJson || selectedAngleIndex === null || !script.trim()) {
      toast.error("Angle script is missing.");
      return null;
    }
    setIsVideoPromptLoading(true);
    try {
      const res = await fetch("/api/gpt/ugc-i2v-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angleScript: script }),
      });
      const json = (await res.json()) as { data?: string; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Video prompt failed");
      const text = String(json.data);
      setUgcVideoPromptGpt(text);
      const base = latestSnapRef.current;
      if (base && lastExtractedJson) {
        const snap: LinkToAdUniverseSnapshotV1 = { ...base, ugcVideoPromptGpt: text };
        await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
          videoPrompt: text,
        });
      }
      toast.success("Video prompt saved");
      return text;
    } catch (e) {
      toast.error("Video prompt", { description: e instanceof Error ? e.message : "Unknown error" });
      return null;
    } finally {
      setIsVideoPromptLoading(false);
    }
  }

  async function onGenerateKlingVideo(overrideVideoPrompt?: string) {
    const url = storeUrl.trim();
    const img = nanoBananaImageUrl;
    const prompt = (overrideVideoPrompt ?? ugcVideoPromptGpt).trim();
    if (!url || !lastExtractedJson || !img || !prompt) {
      toast.error("Reference image and video prompt are required.");
      return;
    }
    setIsKlingSubmitting(true);
    const klingPrompt = withAudioHint(prompt);
    lastKlingVideoPromptRef.current = klingPrompt;
    try {
      const res = await fetch("/api/kling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketModel: "kling-3.0/video",
          prompt: klingPrompt,
          imageUrl: img,
          duration: 12,
          mode: "std",
          sound: true,
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Video generation failed");
      setKlingVideoUrl(null);
      setKlingTaskId(json.taskId);
      setKlingPollTaskId(json.taskId);
      const base = latestSnapRef.current;
      if (base && lastExtractedJson) {
        const snap: LinkToAdUniverseSnapshotV1 = { ...base, klingTaskId: json.taskId, klingVideoUrl: null };
        await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
          videoPrompt: klingPrompt,
        });
      }
      toast.success("Video generation started");
    } catch (e) {
      toast.error("Video", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setIsKlingSubmitting(false);
    }
  }

  useEffect(() => {
    klingResumeAttemptedRef.current = false;
  }, [klingTaskId]);

  /** Resume KIE polling if the user left during generation (task saved, poll was cancelled on unmount). */
  useEffect(() => {
    if (!klingTaskId?.trim()) return;
    if (klingVideoUrl?.trim()) return;
    if (klingPollTaskId) return;
    if (klingResumeAttemptedRef.current) return;
    klingResumeAttemptedRef.current = true;
    setKlingPollTaskId(klingTaskId);
  }, [klingTaskId, klingVideoUrl, klingPollTaskId]);

  useEffect(() => {
    if (!klingPollTaskId) return;
    const taskId = klingPollTaskId;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const json = (await res.json()) as {
          data?: { status?: string; response?: string[]; error_message?: string };
          error?: string;
        };
        if (!res.ok || !json.data) throw new Error(json.error || "Poll failed");
        if (cancelled) return;
        const s = json.data.status ?? "IN_PROGRESS";
        if (s === "IN_PROGRESS") return;
        if (s === "SUCCESS") {
          const vUrl = json.data.response?.[0];
          if (!vUrl) throw new Error("Video OK but URL missing.");
          setKlingVideoUrl(vUrl);
          setKlingPollTaskId(null);
          const url0 = storeUrl.trim();
          const base = latestSnapRef.current;
          if (base && lastExtractedJson && url0) {
            const snap: LinkToAdUniverseSnapshotV1 = { ...base, klingVideoUrl: vUrl, klingTaskId: taskId };
            try {
              await persistUniverse(universeRunId, url0, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
                videoUrl: vUrl,
                videoPrompt: lastKlingVideoPromptRef.current || undefined,
              });
            } catch (e) {
              toast.error("Video save failed", {
                description: e instanceof Error ? e.message : "Unknown error",
              });
            }
          }
          toast.success("Video saved in the project");
          if (interval) clearInterval(interval);
          interval = null;
          return;
        }
        throw new Error(json.data.error_message || `Video generation failed: ${String(s)}`);
      } catch (err) {
        if (cancelled) return;
        toast.error("Video generation", { description: err instanceof Error ? err.message : "Unknown error" });
        setKlingPollTaskId(null);
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
  }, [klingPollTaskId]);

  const showUploadRecommendation = quality.label === "medium" || quality.label === "bad";
  const showAnglePicker = Boolean(scriptsText && angleLabels[0] && angleLabels[1] && angleLabels[2]);
  const showContinueScripts =
    Boolean(summaryText.trim() && !scriptsText && lastExtractedJson && stage === "ready" && !isWorking);
  const showI2vPipeline = selectedAngleIndex !== null && scriptsText.trim().length > 0;
  const nanoHasThreeImages = nanoBananaImageUrls.length === 3;
  const showVideoPipelinePanels = Boolean(
    nanoBananaImageUrl?.trim() &&
      (userStartedVideoFromImage ||
        ugcVideoPromptGpt.trim() ||
        isVideoPromptLoading ||
        isKlingSubmitting ||
        klingPollTaskId ||
        klingVideoUrl),
  );

  const step1Done = Boolean(summaryText.trim() && resolvedPreviewUrl);
  const step2Done = Boolean(scriptsText.trim() && selectedAngleIndex !== null);
  const step3Done = Boolean(nanoHasThreeImages && nanoBananaImageUrl);
  /** Step 4 = full video flow (prompt + render) until a final video exists. */
  const step4Done = Boolean(klingVideoUrl);

  const universeCurrentStep = useMemo(() => {
    if (!step1Done) return 1;
    if (!step2Done) return 2;
    if (!step3Done) return 3;
    if (!step4Done) return 4;
    return 5;
  }, [step1Done, step2Done, step3Done, step4Done]);

  const universeLoadingMessage = useMemo(() => {
    if (nanoPollTaskId || isNanoAllImagesSubmitting) {
      return "Generating 3 images of your persona with your product…";
    }
    if (isNanoPromptsLoading) return "Preparing image prompts…";
    if (isNanoImageSubmitting) return "Generating your image…";
    if (isVideoPromptLoading) return "Generating video prompt…";
    if (isKlingSubmitting || klingPollTaskId) return "Generating your video…";
    if (!isWorking) return null;
    if (stage === "server_pipeline") {
      return "Scanning the store — page, images, brand brief, and scripts. You can switch pages; your project saves as we go.";
    }
    if (stage === "scanning") {
      return "Checking for a saved project for this URL, then scanning the store page…";
    }
    if (stage === "finding_image") {
      return "Scanning images — collecting product photos and picking the clearest preview…";
    }
    if (stage === "summarizing") {
      return "Reading the brand — turning what we found into a concise brief for your ads…";
    }
    if (stage === "writing_scripts") {
      return "Writing 3 UGC script angles from the brief… You can switch pages — we’ll save when it’s done.";
    }
    return "Working…";
  }, [
    nanoPollTaskId,
    isNanoAllImagesSubmitting,
    isNanoPromptsLoading,
    isNanoImageSubmitting,
    isVideoPromptLoading,
    isKlingSubmitting,
    klingPollTaskId,
    isWorking,
    stage,
  ]);

  useEffect(() => {
    if (!showContinueScripts) {
      autoContinueScriptsFiredRef.current = false;
      return;
    }
    if (isWorking || autoContinueScriptsFiredRef.current) return;
    autoContinueScriptsFiredRef.current = true;
    void onContinueScripts();
  }, [showContinueScripts, isWorking]);

  useEffect(() => {
    if (selectedAngleIndex === null || !scriptsText.trim() || nanoBananaPromptsRaw.trim()) return;
    if (isNanoPromptsLoading || isNanoAllImagesSubmitting || Boolean(nanoPollTaskId)) return;
    const key = `${selectedAngleIndex}|${scriptsText.length}|${nanoBananaPromptsRaw ? 1 : 0}`;
    if (nanoAutoGenKeyRef.current === key) return;
    nanoAutoGenKeyRef.current = key;
    void onGenerateNanoBananaPrompts(selectedAngleIndex as 0 | 1 | 2);
  }, [
    selectedAngleIndex,
    scriptsText,
    nanoBananaPromptsRaw,
    isNanoPromptsLoading,
    isNanoAllImagesSubmitting,
    nanoPollTaskId,
  ]);

  async function handleGenerateVideoFromSelectedImage() {
    if (nanoBananaSelectedImageIndex === null || !nanoBananaImageUrl?.trim()) {
      toast.error("Select a reference image first.");
      return;
    }
    if (isVideoPromptLoading || isKlingSubmitting || Boolean(klingPollTaskId)) return;
    setUserStartedVideoFromImage(true);
    const t = await onGenerateUgcVideoPrompt();
    if (t?.trim()) await onGenerateKlingVideo(t.trim());
  }

  const primaryBtnClass =
    "h-11 rounded-2xl bg-violet-400 px-6 text-black font-semibold border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px] disabled:cursor-wait disabled:pointer-events-none disabled:active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:bg-violet-400 disabled:hover:shadow-[0_6px_0_0_rgba(76,29,149,0.9)] disabled:opacity-100";

  function handleGenerateFromUrl() {
    const u = storeUrl.trim();
    if (!u) {
      toast.error("Enter a store URL.");
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      toast.error("URL must start with https:// (or http://).");
      return;
    }
    if (isWorking) return;
    void onRun();
  }

  const storeHostnameResolved = useMemo(() => storeHostname(storeUrl), [storeUrl]);

  useEffect(() => {
    setBrandFaviconFailed(false);
  }, [storeHostnameResolved]);

  const showBrandHeaderInsteadOfUrl = useMemo(
    () =>
      Boolean(
        summaryText.trim() ||
          scriptsText.trim() ||
          (typeof resolvedPreviewUrl === "string" && resolvedPreviewUrl.length > 0),
      ),
    [summaryText, scriptsText, resolvedPreviewUrl],
  );

  const brandDisplayName = useMemo(() => {
    const t = extractedTitle?.trim();
    if (t) return t;
    const h = storeHostnameResolved;
    if (h) return h;
    const u = storeUrl.trim();
    return u || "Store";
  }, [extractedTitle, storeHostnameResolved, storeUrl]);

  const brandFaviconSrc = useMemo(() => {
    const h = storeHostnameResolved;
    if (!h) return null;
    return brandFaviconUrl(h);
  }, [storeHostnameResolved]);

  const brandSummaryTeaser = useMemo(() => compactBrandSummaryForUi(summaryText), [summaryText]);

  return (
    <>
    <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.10)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Link to Ad</CardTitle>
          {stage === "error" ? (
            <div className="flex items-center gap-2 text-xs text-red-300/90">
              <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-1">Error</span>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <LinkToAdUniverseStepper
          currentStep={universeCurrentStep}
          step1Done={step1Done}
          step2Done={step2Done}
          step3Done={step3Done}
          step4Done={step4Done}
        />
        {universeLoadingMessage ? (
          <div className="-mt-2 mb-2 flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-violet-500/15 bg-violet-500/[0.06] px-3 py-3 sm:gap-4 sm:px-4 shadow-[0_0_24px_rgba(139,92,246,0.12)]">
            {isWorking &&
            (stage === "scanning" ||
              stage === "finding_image" ||
              stage === "server_pipeline" ||
              stage === "summarizing" ||
              stage === "writing_scripts") ? (
              <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-8">
                <WebsiteScanLoader
                  label={
                    stage === "scanning"
                      ? "Scan site"
                      : stage === "finding_image"
                        ? "Scan images"
                        : stage === "summarizing"
                          ? "Brand"
                          : stage === "writing_scripts"
                            ? "Scripts"
                            : "Scanning…"
                  }
                  subtitle={universeLoadingMessage}
                  className="min-w-0 flex-1"
                />
                <WebsiteScanChecklist stage={stage} isWorking={isWorking} className="shrink-0 lg:max-w-[min(100%,22rem)]" />
              </div>
            ) : (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-300" aria-hidden />
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <TextShimmer as="span" className="text-sm font-medium">
                    {universeLoadingMessage}
                  </TextShimmer>
                  {(nanoPollTaskId || isNanoAllImagesSubmitting) ? (
                    <span className="text-xs font-normal text-white/50">
                      This may take several minutes.
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}
        <div className="space-y-3">
          {!showBrandHeaderInsteadOfUrl ? (
            <div>
              <Label className="text-base font-medium text-white/80">Store URL</Label>
              <div className="relative mt-2 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                {isWorking ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[#0b0912]/70 backdrop-blur-[2px]"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <div className="flex items-center gap-2.5 rounded-2xl border border-violet-500/35 bg-[#0b0912]/95 px-5 py-2.5 shadow-[0_6px_0_0_rgba(76,29,149,0.75)]">
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-300" aria-hidden />
                      <span className="text-sm font-semibold text-white/90">Starting…</span>
                    </div>
                  </div>
                ) : null}
                <Input
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  placeholder="https://..."
                  disabled={isWorking}
                  className="h-14 min-h-[3.5rem] min-w-0 flex-1 rounded-xl border-white/10 bg-white/[0.03] px-4 text-lg text-white placeholder:text-white/35 disabled:cursor-wait disabled:opacity-60"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleGenerateFromUrl();
                    }
                  }}
                />
                <Button
                  type="button"
                  disabled={isWorking || !storeUrl.trim()}
                  onClick={handleGenerateFromUrl}
                  aria-busy={isWorking}
                  className={`${primaryBtnClass} h-14 min-h-[3.5rem] shrink-0 px-8 text-base sm:min-w-[160px] inline-flex items-center justify-center gap-2`}
                >
                  {isWorking ? (
                    <>
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                      Working…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
                      Generate
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-white/50">
                Paste your store URL and click <span className="text-white/65">Generate</span> (or press Enter). We scan
                the shop and continue until you choose an angle, then an image, then we finish the ad.
              </p>
            </div>
          ) : null}
        </div>

        {resolvedPreviewUrl || summaryText.trim() || (isWorking && storeUrl.trim()) ? (
          <div className="mx-auto w-full max-w-xl">
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {showBrandHeaderInsteadOfUrl ? (
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#0d0a14]">
                          {brandFaviconSrc && !brandFaviconFailed ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={brandFaviconSrc}
                              alt=""
                              width={28}
                              height={28}
                              className="h-7 w-7 object-contain"
                              referrerPolicy="no-referrer"
                              onError={() => setBrandFaviconFailed(true)}
                            />
                          ) : (
                            <span className="text-sm font-bold uppercase text-violet-300">
                              {(brandDisplayName.slice(0, 1) || "?").toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold leading-tight text-white">{brandDisplayName}</p>
                          {storeHostnameResolved ? (
                            <p className="mt-0.5 truncate text-xs text-white/40">{storeHostnameResolved}</p>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="min-w-0 py-0.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Store</p>
                        <p className="truncate text-sm font-medium text-white/85">
                          {storeHostnameResolved || storeUrl.trim() || "—"}
                        </p>
                        {isWorking ? (
                          <p className="mt-1 text-xs text-violet-300/90">Scanning…</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050507]">
                    {resolvedPreviewUrl && !imgError ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={resolvedPreviewUrl}
                        src={resolvedPreviewUrl}
                        alt="Product"
                        className="h-full w-full object-cover object-center"
                        loading="eager"
                        referrerPolicy="no-referrer"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-1 text-center text-[10px] leading-tight text-white/35">
                        {resolvedPreviewUrl
                          ? "Can't load"
                          : isWorking
                            ? "…"
                            : "No image"}
                      </div>
                    )}
                    {resolvedPreviewUrl && !imgError ? (
                      <div className="pointer-events-none absolute bottom-0.5 right-0.5 rounded border border-white/10 bg-black/70 px-1 py-px backdrop-blur-sm">
                        {quality.label === "good" ? (
                          <span className="text-[8px] font-medium text-emerald-400">OK</span>
                        ) : (
                          <span className={`text-[8px] font-medium ${quality.color}`}>{quality.label}</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                {brandSummaryTeaser ? (
                  <p className="mt-3 line-clamp-3 text-xs leading-snug text-white/50">{brandSummaryTeaser}</p>
                ) : null}

                {imgError && resolvedPreviewUrl ? (
                  <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    Could not load the image preview (hotlinking may block embeds).{" "}
                    <a
                      href={resolvedPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline underline-offset-2"
                    >
                      Open image
                    </a>
                  </div>
                ) : null}

                {showUploadRecommendation ? (
                  <div className="mt-4 rounded-lg border border-violet-500/25 bg-violet-500/[0.08] p-3">
                    <p className="text-sm font-semibold text-violet-200">Upload recommended</p>
                    <p className="mt-1 text-xs text-white/55">{quality.help}</p>
                    <div className="mt-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/*"
                        className="sr-only"
                        onChange={(e) => {
                          void uploadNeutralPhoto(e.target.files);
                          e.currentTarget.value = "";
                        }}
                        disabled={isWorking}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isWorking}
                        className="w-full border border-white/10 bg-white/5 text-white hover:bg-white/10 cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Upload neutral product-only photo
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {selectedAngleIndex === null &&
        (summaryText.trim() ||
          scriptsText.trim() ||
          showContinueScripts ||
          (isWorking && stage === "writing_scripts")) ? (
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
            {isWorking && stage === "writing_scripts" ? (
              <div className="flex items-center gap-2 text-xs text-violet-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Writing three script angles…
              </div>
            ) : showAnglePicker ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {([0, 1, 2] as const).map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => void onSelectAngle(i)}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition-all hover:border-violet-400/40 hover:bg-white/[0.07]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-violet-300">Angle {i + 1}</span>
                    </div>
                    <p className="mt-2 text-sm leading-snug text-white/85">{angleLabels[i]}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[80px] items-center justify-center rounded-lg border border-white/10 bg-black/20 px-4 text-center text-sm text-white/35">
                Waiting for scripts…
              </div>
            )}
          </div>
        ) : null}

        {showI2vPipeline ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-4 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
              {nanoBananaPromptsRaw && nanoHasThreeImages ? (
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Generated images</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {([0, 1, 2] as const).map((i) => {
                      const selected = nanoBananaSelectedImageIndex === i;
                      return (
                        <div
                          key={i}
                          role="button"
                          tabIndex={0}
                          aria-pressed={selected}
                          onClick={() => void onSelectNanoBananaImage(i)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              void onSelectNanoBananaImage(i);
                            }
                          }}
                          className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-[#08080c] text-left transition-[transform,box-shadow,border-color] duration-200 ease-out active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0912] ${
                            selected
                              ? "border-[3px] border-violet-400 shadow-[0_0_0_1px_rgba(139,92,246,0.45),0_0_28px_rgba(139,92,246,0.22),0_12px_40px_rgba(76,29,149,0.25)]"
                              : "border border-white/10 hover:border-violet-400/40"
                          }`}
                        >
                          <span className="border-b border-white/10 px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-violet-300/90">
                            Image {i + 1}
                          </span>
                              <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#050507]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={nanoBananaImageUrls[i]}
                                  alt={`Reference ${i + 1}`}
                                  className="h-full w-full object-cover object-center"
                                  loading="lazy"
                                />
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="absolute bottom-2 right-2 z-20 h-8 gap-1 rounded-lg border border-white/15 bg-black/70 px-2 text-[10px] font-semibold text-white shadow-lg backdrop-blur-md hover:bg-black/85"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNanoImageLightboxUrl(nanoBananaImageUrls[i]);
                                  }}
                                >
                                  <Maximize2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                  Full view
                                </Button>
                              </div>
                              {selected ? (
                                <span className="absolute right-2 top-9 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-violet-200/40 bg-violet-400 text-black shadow-md shadow-violet-500/30">
                                  <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                  <div className="border-t border-white/10 pt-5">
                    {nanoBananaSelectedImageIndex === null ? (
                      <p className="text-center text-xs text-white/45">
                        Select an image, then generate your video from this section.
                      </p>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Button
                          type="button"
                          disabled={
                            isVideoPromptLoading || isKlingSubmitting || Boolean(klingPollTaskId) || !nanoBananaImageUrl
                          }
                          onClick={() => void handleGenerateVideoFromSelectedImage()}
                          className={`${primaryBtnClass} w-full max-w-md`}
                        >
                          {isVideoPromptLoading || isKlingSubmitting || klingPollTaskId ? (
                            <>
                              <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                              Working…
                            </>
                          ) : (
                            <>
                              <Video className="h-5 w-5 shrink-0" aria-hidden />
                              Generate video from this image
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="mt-auto shrink-0 rounded-xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap gap-2">
                  {selectedAngleIndex !== null &&
                  !nanoBananaPromptsRaw.trim() &&
                  !isNanoPromptsLoading &&
                  !isNanoAllImagesSubmitting &&
                  !nanoPollTaskId ? (
                    <Button
                      type="button"
                      disabled={!resolvedPreviewUrl}
                      className={primaryBtnClass}
                      onClick={() => void onGenerateNanoBananaPrompts(selectedAngleIndex as 0 | 1 | 2)}
                    >
                      Retry prompts &amp; 3 images
                    </Button>
                  ) : null}
                  {nanoPollTaskId || isNanoPromptsLoading || isNanoAllImagesSubmitting ? (
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-medium text-violet-200">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                        {nanoPollTaskId || isNanoAllImagesSubmitting
                          ? "Generating 3 images of your persona with your product…"
                          : "Preparing image prompts…"}
                      </span>
                      {nanoPollTaskId || isNanoAllImagesSubmitting ? (
                        <span className="text-xs font-normal text-white/45">
                          This may take several minutes.
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {showVideoPipelinePanels ? (
              <div className="flex flex-col gap-6 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Your video</p>
                  <p className="mt-1 text-xs text-white/45">Latest render appears here. Prompt and actions are below.</p>
                  {klingVideoUrl ? (
                    <div className="mt-4 space-y-2">
                      <video src={klingVideoUrl} controls className="w-full max-h-[480px] rounded-lg border border-white/10" />
                      <a
                        href={`/api/download?url=${encodeURIComponent(klingVideoUrl)}`}
                        className="text-xs font-medium text-violet-300 underline underline-offset-2"
                      >
                        Download video
                      </a>
                    </div>
                  ) : null}
                  {nanoBananaImageUrl &&
                  ugcVideoPromptGpt.trim() &&
                  !klingVideoUrl &&
                  !klingPollTaskId &&
                  !isKlingSubmitting ? (
                    <Button type="button" className={`mt-4 ${primaryBtnClass}`} onClick={() => void onGenerateKlingVideo()}>
                      Retry video render
                    </Button>
                  ) : null}
                  {isKlingSubmitting ? (
                    <div className="mt-4 flex items-center gap-2 text-xs text-violet-200">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting video render…
                    </div>
                  ) : null}
                  {klingPollTaskId ? (
                    <p className="mt-4 flex items-center gap-2 text-xs text-violet-200">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generating video…
                    </p>
                  ) : null}
                </div>

                <div className="mt-auto shrink-0 space-y-4 border-t border-white/10 pt-5">
                  <div>
                    <p className="text-sm font-semibold text-white/90">Video</p>
                    <p className="mt-1 text-xs text-white/45">
                      Motion prompt and final render. You can retry each step if something fails.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Prompt</p>
                    {nanoBananaImageUrl &&
                    userStartedVideoFromImage &&
                    !ugcVideoPromptGpt.trim() &&
                    !isVideoPromptLoading &&
                    selectedAngleIndex !== null ? (
                      <Button
                        type="button"
                        className={`mt-2 ${primaryBtnClass}`}
                        onClick={() => void onGenerateUgcVideoPrompt()}
                      >
                        Retry video prompt
                      </Button>
                    ) : null}
                    {isVideoPromptLoading ? (
                      <div className="mt-3 flex items-center gap-2 text-xs text-violet-200">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating video prompt…
                      </div>
                    ) : null}
                    {ugcVideoPromptGpt ? (
                      <pre className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/75">
                        {ugcVideoPromptGpt}
                      </pre>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>

    {nanoImageLightboxUrl ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/88 p-4 backdrop-blur-[2px]"
        onClick={() => setNanoImageLightboxUrl(null)}
        role="dialog"
        aria-modal="true"
        aria-label="Full reference image"
      >
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute right-3 top-3 z-10 h-10 w-10 rounded-full border border-white/20 bg-black/65 text-white shadow-lg hover:bg-black/85"
          onClick={(e) => {
            e.stopPropagation();
            setNanoImageLightboxUrl(null);
          }}
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden />
        </Button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={nanoImageLightboxUrl}
          alt="Full reference image preview"
          className="max-h-[92vh] max-w-[min(100%,1200px)] rounded-xl border border-violet-500/20 object-contain shadow-[0_0_60px_rgba(139,92,246,0.15)]"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    ) : null}
    </>
  );
}
