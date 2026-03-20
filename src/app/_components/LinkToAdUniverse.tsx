"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { absolutizeImageUrl } from "@/lib/imageUrl";
import {
  deriveAngleLabelsFromScripts,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";

type ProductCandidate = { url: string; reason?: string } | string;

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
      color: "text-amber-300",
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

function readUniverseFromExtracted(extracted: unknown): LinkToAdUniverseSnapshotV1 | null {
  if (!extracted || typeof extracted !== "object") return null;
  const u = (extracted as Record<string, unknown>).__universe;
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  if (o.v !== 1) return null;
  const clean = o.cleanCandidate;
  return {
    v: 1,
    phase: o.phase === "after_scripts" ? "after_scripts" : "after_summary",
    cleanCandidate:
      clean && typeof clean === "object" && typeof (clean as { url?: string }).url === "string"
        ? {
            url: String((clean as { url: string }).url),
            reason: typeof (clean as { reason?: string }).reason === "string" ? (clean as { reason: string }).reason : undefined,
          }
        : null,
    fallbackImageUrl: typeof o.fallbackImageUrl === "string" ? o.fallbackImageUrl : null,
    confidence: typeof o.confidence === "string" ? o.confidence : o.confidence != null ? String(o.confidence) : null,
    neutralUploadUrl: typeof o.neutralUploadUrl === "string" ? o.neutralUploadUrl : null,
    summaryText: typeof o.summaryText === "string" ? o.summaryText : "",
    scriptsText: typeof o.scriptsText === "string" ? o.scriptsText : "",
    angleLabels:
      Array.isArray(o.angleLabels) && o.angleLabels.length >= 3
        ? [String(o.angleLabels[0]), String(o.angleLabels[1]), String(o.angleLabels[2])]
        : ["", "", ""],
    selectedAngleIndex: typeof o.selectedAngleIndex === "number" && o.selectedAngleIndex >= 0 && o.selectedAngleIndex <= 2 ? o.selectedAngleIndex : null,
  };
}

function cloneExtractedBase(extracted: unknown): Record<string, unknown> {
  try {
    const o = extracted && typeof extracted === "object" ? (extracted as Record<string, unknown>) : {};
    const { __universe: _, ...rest } = o;
    return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function LinkToAdUniverse({ resumeRunId, onResumeConsumed, onRunsChanged }: LinkToAdUniverseProps) {
  const [storeUrl, setStoreUrl] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [extractedTitle, setExtractedTitle] = useState<string | null>(null);

  const [cleanCandidate, setCleanCandidate] = useState<{ url: string; reason?: string } | null>(null);
  const [fallbackImageUrl, setFallbackImageUrl] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [neutralUploadUrl, setNeutralUploadUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const [summaryText, setSummaryText] = useState<string>("");
  const [scriptsText, setScriptsText] = useState<string>("");
  const [stage, setStage] = useState<
    "idle" | "scanning" | "finding_image" | "summarizing" | "writing_scripts" | "ready" | "error"
  >("idle");

  const [universeRunId, setUniverseRunId] = useState<string | null>(null);
  const [lastExtractedJson, setLastExtractedJson] = useState<Record<string, unknown> | null>(null);
  const [angleLabels, setAngleLabels] = useState<[string, string, string]>(["", "", ""]);
  const [selectedAngleIndex, setSelectedAngleIndex] = useState<number | null>(null);
  const [showFullScripts, setShowFullScripts] = useState(false);
  const [forceNewScan, setForceNewScan] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const quality = useMemo(() => confidenceToQuality(confidence ?? undefined), [confidence]);
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

  const hydrateFromRun = useCallback(
    (run: {
      id: string;
      store_url?: string | null;
      title?: string | null;
      extracted?: unknown;
    }) => {
      const snap = readUniverseFromExtracted(run.extracted);
      if (!snap) {
        toast.error("Ce run n’a pas de données Link to Ad Universe.");
        return;
      }
      setUniverseRunId(run.id);
      setStoreUrl(typeof run.store_url === "string" ? run.store_url : "");
      setExtractedTitle(typeof run.title === "string" ? run.title : null);
      setCleanCandidate(snap.cleanCandidate);
      setFallbackImageUrl(snap.fallbackImageUrl);
      setConfidence(snap.confidence);
      setNeutralUploadUrl(snap.neutralUploadUrl);
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
      setLastExtractedJson(cloneExtractedBase(run.extracted));
      setStage("ready");
      setImgError(false);
      toast.success("Projet repris");
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
        toast.error("Impossible de charger le projet", {
          description: e instanceof Error ? e.message : "Erreur",
        });
      } finally {
        if (!cancelled) onResumeConsumed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeRunId, onResumeConsumed, hydrateFromRun]);

  const persistUniverse = useCallback(
    async (
      runId: string | null,
      url: string,
      title: string | null,
      extractedBase: Record<string, unknown>,
      snapshot: LinkToAdUniverseSnapshotV1,
      packshotUrls: string[],
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
    setSelectedAngleIndex(index);
    const url = storeUrl.trim();
    if (!url || !lastExtractedJson) return;
    const snap: LinkToAdUniverseSnapshotV1 = {
      v: 1,
      phase: scriptsText ? "after_scripts" : "after_summary",
      cleanCandidate,
      fallbackImageUrl,
      confidence,
      neutralUploadUrl,
      summaryText,
      scriptsText,
      angleLabels,
      selectedAngleIndex: index,
    };
    try {
      await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave());
    } catch {
      /* ignore */
    }
  }

  function packshotsForSave(): string[] {
    const u = resolvedPreviewUrl;
    return u ? [u] : [];
  }

  /** Resume after a save stopped at brand brief (scripts step failed or interrupted). */
  async function onContinueScripts() {
    const url = storeUrl.trim();
    if (!url || !lastExtractedJson || !summaryText.trim()) {
      toast.error("Données incomplètes pour générer les scripts.");
      return;
    }
    const userUploadedImageUrl = neutralUploadUrl;
    const titleForScripts = extractedTitle;
    const summaryStr = summaryText;
    const base = lastExtractedJson;
    const pickedImage = userUploadedImageUrl ?? cleanCandidate?.url ?? fallbackImageUrl ?? null;
    let imageForGpt: string | null = null;
    if (pickedImage) {
      imageForGpt = /^https?:\/\//i.test(pickedImage)
        ? pickedImage
        : absolutizeImageUrl(pickedImage, url) ?? pickedImage;
    }

    let activeRunId = universeRunId;
    setIsWorking(true);
    setStage("writing_scripts");
    try {
      const scriptsRes = await fetch("/api/gpt/ugc-scripts-from-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeUrl: url,
          productTitle: titleForScripts,
          brandBrief: summaryStr,
          productImageUrl: imageForGpt,
          videoDurationSeconds: 15,
        }),
      });
      if (!scriptsRes.ok) {
        const raw = await scriptsRes.text().catch(() => "");
        throw new Error(`UGC scripts failed: HTTP ${scriptsRes.status} ${raw.slice(0, 250)}`);
      }
      const scriptsJson = (await scriptsRes.json()) as { data?: string; error?: string };
      if (scriptsJson.error) throw new Error(scriptsJson.error);
      const scriptsStr = String(scriptsJson?.data ?? "");
      setScriptsText(scriptsStr);
      const labels = deriveAngleLabelsFromScripts(scriptsStr);
      setAngleLabels(labels);
      const snapAfterScripts: LinkToAdUniverseSnapshotV1 = {
        v: 1,
        phase: "after_scripts",
        cleanCandidate,
        fallbackImageUrl,
        confidence,
        neutralUploadUrl: userUploadedImageUrl,
        summaryText: summaryStr,
        scriptsText: scriptsStr,
        angleLabels: labels,
        selectedAngleIndex: null,
      };
      const shots = imageForGpt ? [imageForGpt] : [];
      await persistUniverse(activeRunId, url, titleForScripts, base, snapAfterScripts, shots);
      setStage("ready");
      toast.success("3 scripts UGC prêts");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scripts step failed";
      toast.warning("Échec génération scripts", { description: msg });
      setStage("ready");
    } finally {
      setIsWorking(false);
    }
  }

  async function onRun() {
    const url = storeUrl.trim();
    if (!url) {
      toast.error("Missing URL");
      return;
    }

    const userUploadedImageUrl = neutralUploadUrl;

    if (!forceNewScan) {
      try {
        const findRes = await fetch(`/api/runs/find-by-store-url?url=${encodeURIComponent(url)}`, { cache: "no-store" });
        const findJson = (await findRes.json()) as { data?: { id: string; store_url?: string; title?: string | null; extracted?: unknown } };
        if (findRes.ok && findJson.data) {
          const snap = readUniverseFromExtracted(findJson.data.extracted);
          if (snap) {
            hydrateFromRun(findJson.data);
            setIsWorking(false);
            return;
          }
        }
      } catch {
        /* continue fresh scan */
      }
    }

    setIsWorking(true);
    setSummaryText("");
    setScriptsText("");
    setAngleLabels(["", "", ""]);
    setSelectedAngleIndex(null);
    setShowFullScripts(false);
    let activeRunId: string | null = null;
    setUniverseRunId(null);
    setLastExtractedJson(null);
    setExtractedTitle(null);
    setCleanCandidate(null);
    setFallbackImageUrl(null);
    setConfidence(null);
    setImgError(false);

    try {
      setStage("scanning");
      const extractRes = await fetch("/api/store/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!extractRes.ok) {
        const raw = await extractRes.text().catch(() => "");
        throw new Error(`Extract failed: HTTP ${extractRes.status} ${raw.slice(0, 250)}`);
      }
      const extracted = (await extractRes.json()) as unknown;
      const extractedObj = extracted as { title?: unknown; images?: unknown };
      setExtractedTitle(typeof extractedObj.title === "string" ? extractedObj.title : null);

      const base = cloneExtractedBase(extracted);
      setLastExtractedJson(base);

      const images: string[] = Array.isArray(extractedObj.images)
        ? extractedObj.images.filter((x): x is string => typeof x === "string")
        : [];
      if (!images.length) {
        throw new Error("No images found on that page.");
      }

      setStage("finding_image");
      const classifyRes = await fetch("/api/gpt/images-classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: url, imageUrls: images }),
      });
      if (!classifyRes.ok) {
        const raw = await classifyRes.text().catch(() => "");
        throw new Error(`Images classify failed: HTTP ${classifyRes.status} ${raw.slice(0, 250)}`);
      }
      const classifyJson = (await classifyRes.json()) as unknown;
      const classifyObj = classifyJson as {
        error?: unknown;
        data?: {
          productOnlyUrls?: unknown;
          confidence?: unknown;
          otherUrls?: unknown;
        };
      };
      if (typeof classifyObj.error === "string") throw new Error(classifyObj.error);

      const candidatesRaw: ProductCandidate[] = Array.isArray(classifyObj.data?.productOnlyUrls)
        ? (classifyObj.data!.productOnlyUrls as ProductCandidate[])
        : [];

      const normalizeCandidate = (c: ProductCandidate) => {
        if (typeof c === "string") return { url: c.trim(), reason: undefined as string | undefined };
        const obj = c as { url?: unknown; reason?: unknown };
        const u0 = obj?.url;
        if (typeof u0 === "string") {
          return {
            url: u0.trim(),
            reason: typeof obj.reason === "string" ? obj.reason : undefined,
          };
        }
        return { url: "", reason: undefined as string | undefined };
      };

      const validCandidates = candidatesRaw
        .map((c) => normalizeCandidate(c))
        .filter((x) => x.url.length > 0);

      const firstCandidate = validCandidates[0];
      const cleanUrl = firstCandidate?.url ?? null;
      const reason = firstCandidate?.reason;

      const otherUrlsRaw: unknown[] = Array.isArray(classifyObj.data?.otherUrls)
        ? (classifyObj.data!.otherUrls as unknown[])
        : [];
      const firstOther = (() => {
        for (const x of otherUrlsRaw) {
          if (typeof x === "string" && x.trim().length > 0) return x;
        }
        return undefined;
      })();

      const confidenceVal = classifyObj.data?.confidence;
      setConfidence(
        typeof confidenceVal === "string" ? confidenceVal : confidenceVal != null ? String(confidenceVal) : "low",
      );
      if (cleanUrl) setCleanCandidate({ url: cleanUrl, reason });
      setFallbackImageUrl(firstOther?.trim() || images.find((u) => typeof u === "string" && u.trim().length > 0) || null);

      setStage("summarizing");
      const summaryRes = await fetch("/api/gpt/brand-url-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!summaryRes.ok) {
        const raw = await summaryRes.text().catch(() => "");
        throw new Error(`Brand summary failed: HTTP ${summaryRes.status} ${raw.slice(0, 250)}`);
      }
      const summaryJson = (await summaryRes.json()) as { data?: string };
      const summaryStr = String(summaryJson?.data ?? "");
      setSummaryText(summaryStr);

      const titleForScripts = typeof extractedObj.title === "string" ? extractedObj.title : null;
      const pickedImage =
        userUploadedImageUrl ?? cleanUrl ?? firstOther?.trim() ?? images[0] ?? null;
      let imageForGpt: string | null = null;
      if (pickedImage) {
        imageForGpt = /^https?:\/\//i.test(pickedImage)
          ? pickedImage
          : absolutizeImageUrl(pickedImage, url) ?? pickedImage;
      }

      const snapAfterSummary: LinkToAdUniverseSnapshotV1 = {
        v: 1,
        phase: "after_summary",
        cleanCandidate: cleanUrl ? { url: cleanUrl, reason } : null,
        fallbackImageUrl: firstOther?.trim() || images[0] || null,
        confidence:
          typeof confidenceVal === "string" ? confidenceVal : confidenceVal != null ? String(confidenceVal) : "low",
        neutralUploadUrl: userUploadedImageUrl,
        summaryText: summaryStr,
        scriptsText: "",
        angleLabels: ["", "", ""],
        selectedAngleIndex: null,
      };
      try {
        const shots = imageForGpt ? [imageForGpt] : [];
        activeRunId = await persistUniverse(activeRunId, url, titleForScripts, base, snapAfterSummary, shots);
        toast.success("Projet sauvegardé (image + brief)");
      } catch (e) {
        toast.message("Sauvegarde projet échouée", { description: e instanceof Error ? e.message : "" });
      }

      setStage("writing_scripts");
      let scriptsStepOk = false;
      let scriptsStr = "";
      try {
        const scriptsRes = await fetch("/api/gpt/ugc-scripts-from-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeUrl: url,
            productTitle: titleForScripts,
            brandBrief: summaryStr,
            productImageUrl: imageForGpt,
            videoDurationSeconds: 15,
          }),
        });
        if (!scriptsRes.ok) {
          const raw = await scriptsRes.text().catch(() => "");
          throw new Error(`UGC scripts failed: HTTP ${scriptsRes.status} ${raw.slice(0, 250)}`);
        }
        const scriptsJson = (await scriptsRes.json()) as { data?: string; error?: string };
        if (scriptsJson.error) throw new Error(scriptsJson.error);
        scriptsStr = String(scriptsJson?.data ?? "");
        setScriptsText(scriptsStr);
        scriptsStepOk = true;
      } catch (scriptErr) {
        const msg = scriptErr instanceof Error ? scriptErr.message : "Scripts step failed";
        setScriptsText("");
        toast.warning("Brand brief OK — scripts step failed", { description: msg });
      }

      if (scriptsStepOk && scriptsStr) {
        const labels = deriveAngleLabelsFromScripts(scriptsStr);
        setAngleLabels(labels);
        const snapAfterScripts: LinkToAdUniverseSnapshotV1 = {
          v: 1,
          phase: "after_scripts",
          cleanCandidate: cleanUrl ? { url: cleanUrl, reason } : null,
          fallbackImageUrl: firstOther?.trim() || images[0] || null,
          confidence:
            typeof confidenceVal === "string" ? confidenceVal : confidenceVal != null ? String(confidenceVal) : "low",
          neutralUploadUrl: userUploadedImageUrl,
          summaryText: summaryStr,
          scriptsText: scriptsStr,
          angleLabels: labels,
          selectedAngleIndex: null,
        };
        try {
          const shots = imageForGpt ? [imageForGpt] : [];
          activeRunId = await persistUniverse(activeRunId, url, titleForScripts, base, snapAfterScripts, shots);
        } catch {
          /* ignore */
        }
      }

      setStage("ready");
      if (scriptsStepOk) toast.success("Brief + 3 UGC scripts ready");
    } catch (err) {
      setStage("error");
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error("Universe error", { description: message });
    } finally {
      setIsWorking(false);
    }
  }

  const showUploadRecommendation = quality.label === "medium" || quality.label === "bad";
  const showAnglePicker = Boolean(scriptsText && angleLabels[0] && angleLabels[1] && angleLabels[2]);
  const showContinueScripts =
    Boolean(summaryText.trim() && !scriptsText && lastExtractedJson && stage === "ready" && !isWorking);

  const primaryBtnClass =
    "h-11 rounded-2xl bg-violet-400 px-6 text-black font-semibold border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px]";

  return (
    <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.10)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Link to Ad Universe</CardTitle>
            <p className="mt-1 text-sm text-white/55">
              Step 1: scan URL, product image, English brand brief. Step 2: three UGC scripts (3 angles). Saves
              automatically to Projects.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/45">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Stage: <span className="text-white/70">{stage}</span>
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px]">
              <Label className="text-white/70">Store URL</Label>
              <Input
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="https://..."
                className="mt-2 border-white/10 bg-white/[0.03] text-white"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-white/50">
                <input
                  type="checkbox"
                  checked={forceNewScan}
                  onChange={(e) => setForceNewScan(e.target.checked)}
                  className="rounded border-white/20 bg-white/5"
                />
                Force new scan
              </label>
              <Button type="button" onClick={onRun} disabled={isWorking} className={primaryBtnClass}>
                {isWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isWorking
                  ? stage === "writing_scripts"
                    ? "Writing scripts..."
                    : "Scanning..."
                  : "Generate"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Clean product image</p>
                {quality.label === "good" ? (
                  <span className="text-xs text-emerald-400">Quality: good</span>
                ) : (
                  <span className={`text-xs ${quality.color}`}>Quality: {quality.label}</span>
                )}
              </div>

              <div className="mt-3 aspect-[4/3] w-full overflow-hidden rounded-lg border border-white/10 bg-[#050507]">
                {resolvedPreviewUrl && !imgError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={resolvedPreviewUrl}
                    src={resolvedPreviewUrl}
                    alt="Clean product"
                    className="h-full w-full object-contain"
                    loading="eager"
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/35">
                    {resolvedPreviewUrl
                      ? "Image couldn't be loaded. Check the link below."
                      : "Run the scan to see the clean product image."}
                  </div>
                )}
              </div>

              {cleanCandidate?.reason ? (
                <p className="mt-3 text-xs text-white/55">
                  Candidate reason: <span className="text-white/70">{cleanCandidate.reason}</span>
                </p>
              ) : null}

              {extractedTitle ? (
                <p className="mt-2 text-xs text-white/45">Detected: {extractedTitle}</p>
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
                <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
                  <p className="text-sm font-semibold text-amber-300">Upload recommended</p>
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

          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold">Brand brief (English)</p>
              <div className="mt-3 min-h-[180px]">
                {summaryText ? (
                  <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap text-xs text-white/70 leading-relaxed">
                    {summaryText}
                  </pre>
                ) : (
                  <div className="flex h-[180px] items-center justify-center text-sm text-white/35">
                    After scanning, we generate your English brand brief here.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white/90">Step 2 — Choose your angle</p>
            {isWorking && stage === "writing_scripts" ? (
              <span className="flex items-center gap-2 text-xs text-violet-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating with GPT…
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-white/45">
            Three marketing angles (15s scripts). Pick the one you want to produce first — full scripts stay available
            below.
          </p>

          {showContinueScripts ? (
            <div className="mt-4">
              <Button type="button" onClick={() => void onContinueScripts()} className={primaryBtnClass}>
                Générer les 3 scripts UGC
              </Button>
              <p className="mt-2 text-xs text-white/40">
                Le brief est déjà sauvegardé — lance uniquement la génération des 3 angles.
              </p>
            </div>
          ) : null}

          {showAnglePicker ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {([0, 1, 2] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void onSelectAngle(i)}
                  className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                    selectedAngleIndex === i
                      ? "border-violet-400 bg-violet-500/20 shadow-[0_6px_0_0_rgba(76,29,149,0.85)]"
                      : "border-white/10 bg-white/[0.04] hover:border-violet-400/40 hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-violet-300">Angle {i + 1}</span>
                    {selectedAngleIndex === i ? (
                      <Check className="h-4 w-4 text-violet-300" aria-hidden />
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-snug text-white/85">{angleLabels[i]}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex min-h-[100px] items-center justify-center rounded-lg border border-white/10 bg-black/20 px-4 text-center text-sm text-white/35">
              {isWorking && stage === "writing_scripts"
                ? "Writing SCRIPT OPTION 1–3…"
                : "Generate to create three angle options here."}
            </div>
          )}

          {scriptsText ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowFullScripts((s) => !s)}
                className="flex items-center gap-2 text-xs font-medium text-violet-300 hover:text-violet-200"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showFullScripts ? "rotate-180" : ""}`} />
                {showFullScripts ? "Hide full scripts" : "View full scripts (3 options)"}
              </button>
              {showFullScripts ? (
                <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/75 leading-relaxed">
                  {scriptsText}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
