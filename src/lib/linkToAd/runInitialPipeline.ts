import {
  cloneExtractedBase,
  deriveAngleLabelsFromScripts,
  readUniverseFromExtracted,
  UNIVERSE_PIPELINE_CLEAR,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";
import { dedupeHttpsProductUrls, productUrlsForGpt } from "@/lib/productReferenceImages";
import type { InternalFetch } from "@/lib/linkToAd/internalFetch";
import { LINK_TO_AD_DEFAULT_VIDEO_DURATION_SEC } from "@/lib/linkToAd/generationCredits";
import { normalizeUgcScriptVideoDurationSec } from "@/lib/ugcAiScriptBrief";

type ProductCandidate = { url: string; reason?: string } | string;

function normalizeCandidate(c: ProductCandidate): { url: string; reason?: string } {
  if (typeof c === "string") return { url: c.trim(), reason: undefined };
  const obj = c as { url?: unknown; reason?: unknown };
  const u0 = obj?.url;
  if (typeof u0 === "string") {
    return {
      url: u0.trim(),
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
    };
  }
  return { url: "", reason: undefined };
}

async function upsertViaApi(
  f: InternalFetch,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await f("/api/runs/upsert", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { runId?: string; error?: string };
  if (!res.ok || !json.runId) throw new Error(json.error || "Save failed");
  return json.runId;
}

export type InitialPipelineResult =
  | {
      ok: true;
      runId: string;
      scriptsStepOk: boolean;
      scriptsError?: string;
      /** True when vision thinks packaging/label legibility is weak — user should add pouch/pack photos. */
      suggestAdditionalProductPhotos?: boolean;
    }
  | { ok: false; error: string; runId?: string };

/** Checklist step 0–4 while the initial pipeline runs (real order, not simulated). */
export type InitialPipelineStepIndex = 0 | 1 | 2 | 3 | 4;

/**
 * Full Link to Ad initial chain: extract → classify → brand brief → save → UGC scripts → save.
 * Optional `onProgress` fires at the start of each major step (for UI). Safe to call from browser `fetch`.
 */
export async function runInitialPipeline(
  f: InternalFetch,
  opts: {
    storeUrl: string;
    neutralUploadUrl: string | null;
    /** User product uploads (main + additional) captured before a fresh run — used when main slot is empty. */
    userProductImageUrls?: string[];
    /** Persona / avatar reference URLs for script generation vision. */
    personaImageUrls?: string[];
    generationMode?: "automatic" | "custom_ugc";
    customUgcIntent?: string;
    aiProvider?: "gpt" | "claude";
    /** 5 / 10 / 15 / 30 — spoken-word budget for UGC scripts (Link to Ad duration control). */
    videoDurationSeconds?: number;
  },
  onProgress?: (step: InitialPipelineStepIndex) => void,
): Promise<InitialPipelineResult> {
  const url = opts.storeUrl.trim();
  const userPrefill = (opts.userProductImageUrls ?? [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);
  const explicitNeutral = opts.neutralUploadUrl?.trim() || null;
  const effectiveNeutral = explicitNeutral || userPrefill[0] || null;
  const prefillTail =
    effectiveNeutral && userPrefill[0] === effectiveNeutral ? userPrefill.slice(1) : [...userPrefill];
  const personaForScripts = (opts.personaImageUrls ?? [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => /^https?:\/\//i.test(u));
  const generationMode = opts.generationMode === "custom_ugc" ? "custom_ugc" : "automatic";
  const customUgcIntent = (opts.customUgcIntent ?? "").trim();
  const aiProvider = opts.aiProvider === "claude" ? "claude" : "gpt";
  const scriptTargetDurationSec = normalizeUgcScriptVideoDurationSec(
    opts.videoDurationSeconds ?? LINK_TO_AD_DEFAULT_VIDEO_DURATION_SEC,
  );

  let activeRunId: string | null = null;

  const report = (step: InitialPipelineStepIndex) => {
    try {
      onProgress?.(step);
    } catch {
      /* ignore UI errors */
    }
  };

  try {
    report(0);
    const extractRes = await f("/api/store/extract", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    if (!extractRes.ok) {
      const raw = await extractRes.text().catch(() => "");
      let detail = raw.slice(0, 400);
      try {
        const j = JSON.parse(raw) as { error?: string };
        if (typeof j.error === "string" && j.error.trim()) {
          detail = j.error.trim();
        }
      } catch {
        /* keep raw snippet */
      }
      return { ok: false, error: `Extract failed: ${detail}` };
    }
    const extracted = (await extractRes.json()) as unknown;
    const extractedObj = extracted as { title?: unknown; images?: unknown };
    const titleForScripts = typeof extractedObj.title === "string" ? extractedObj.title : null;

    const base = cloneExtractedBase(extracted);
    const images: string[] = Array.isArray(extractedObj.images)
      ? extractedObj.images.filter((x): x is string => typeof x === "string")
      : [];
    if (!images.length) {
      return { ok: false, error: "No images found on that page." };
    }

    const imagesMeta = Array.isArray((extractedObj as any).imagesMeta) ? (extractedObj as any).imagesMeta : undefined;

    report(1);
    const classifyRes = await f("/api/gpt/images-classify", {
      method: "POST",
      body: JSON.stringify({ pageUrl: url, imageUrls: images, imagesMeta, provider: aiProvider }),
    });
    if (!classifyRes.ok) {
      const raw = await classifyRes.text().catch(() => "");
      return { ok: false, error: `Images classify failed: HTTP ${classifyRes.status} ${raw.slice(0, 250)}` };
    }
    const classifyJson = (await classifyRes.json()) as {
      error?: unknown;
      data?: {
        productOnlyUrls?: unknown;
        candidateUrls?: unknown;
        confidence?: unknown;
        otherUrls?: unknown;
        suggest_additional_product_photos?: unknown;
      };
    };
    if (typeof classifyJson.error === "string") {
      return { ok: false, error: classifyJson.error };
    }

    const candidatesRaw: ProductCandidate[] = Array.isArray(classifyJson.data?.productOnlyUrls)
      ? (classifyJson.data!.productOnlyUrls as ProductCandidate[])
      : [];

    const validCandidates = candidatesRaw.map((c) => normalizeCandidate(c)).filter((x) => x.url.length > 0);
    const candidateUrlsRaw: unknown[] = Array.isArray(classifyJson.data?.candidateUrls)
      ? (classifyJson.data!.candidateUrls as unknown[])
      : [];
    const candidateUrls = candidateUrlsRaw
      .filter((x): x is string => typeof x === "string")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    const firstCandidate = validCandidates[0] ?? (candidateUrls[0] ? { url: candidateUrls[0], reason: undefined } : undefined);
    const cleanUrl = firstCandidate?.url ?? null;
    const reason = firstCandidate?.reason;
    const urlsOnly = validCandidates.map((c) => c.url).filter((x) => x.length > 0);

    const otherUrlsRaw: unknown[] = Array.isArray(classifyJson.data?.otherUrls)
      ? (classifyJson.data!.otherUrls as unknown[])
      : [];
    const firstOther = (() => {
      for (const x of otherUrlsRaw) {
        if (typeof x === "string" && x.trim().length > 0) return x;
      }
      return undefined;
    })();

    const confidenceVal = classifyJson.data?.confidence;
    const confidenceStr =
      typeof confidenceVal === "string" ? confidenceVal : confidenceVal != null ? String(confidenceVal) : "low";
    const suggestAdditionalProductPhotos =
      classifyJson.data?.suggest_additional_product_photos === true;

    report(2);
    const summaryRes = await f("/api/gpt/brand-url-summary", {
      method: "POST",
      body: JSON.stringify({ url, provider: aiProvider }),
    });
    if (!summaryRes.ok) {
      const raw = await summaryRes.text().catch(() => "");
      return { ok: false, error: `Brand summary failed: HTTP ${summaryRes.status} ${raw.slice(0, 250)}` };
    }
    const summaryJson = (await summaryRes.json()) as { data?: string };
    const summaryStr = String(summaryJson?.data ?? "");

    const combinedProductCandidates = dedupeHttpsProductUrls(
      url,
      [...prefillTail, ...(urlsOnly.length ? urlsOnly : candidateUrls)],
    );
    const gptImages = productUrlsForGpt({
      pageUrl: url,
      neutralUploadUrl: effectiveNeutral,
      candidateUrls: combinedProductCandidates,
      fallbackUrl: firstOther?.trim() || images[0] || null,
    });

    const snapshotProductOnly = dedupeHttpsProductUrls(
      url,
      [...userPrefill, ...(candidateUrls.length ? candidateUrls : urlsOnly)],
    );

    const snapAfterSummary: LinkToAdUniverseSnapshotV1 = {
      v: 1,
      phase: "after_summary",
      generationMode,
      customUgcIntent,
      aiProvider,
      ltaVideoDurationSec: scriptTargetDurationSec,
      cleanCandidate: cleanUrl ? { url: cleanUrl, reason } : null,
      fallbackImageUrl: firstOther?.trim() || images[0] || null,
      confidence: confidenceStr,
      neutralUploadUrl: effectiveNeutral,
      productOnlyImageUrls: snapshotProductOnly.length ? snapshotProductOnly : undefined,
      personaPhotoUrls: personaForScripts.length ? personaForScripts : undefined,
      summaryText: summaryStr,
      scriptsText: "",
      angleLabels: ["", "", ""],
      selectedAngleIndex: null,
      ...UNIVERSE_PIPELINE_CLEAR,
    };

    const extractedWithUniverse = { ...base, __universe: snapAfterSummary };
    const shots = gptImages.length > 0 ? gptImages : [];
    activeRunId = await upsertViaApi(f, {
      runId: activeRunId ?? undefined,
      storeUrl: url,
      title: titleForScripts,
      extracted: extractedWithUniverse,
      packshotUrls: shots,
    });

    report(3);
    let scriptsStepOk = false;
    let scriptsStr = "";
    let scriptsError: string | undefined;
    try {
      const scriptsRes = await f("/api/gpt/ugc-scripts-from-brief", {
        method: "POST",
        body: JSON.stringify({
          storeUrl: url,
          productTitle: titleForScripts,
          brandBrief: summaryStr,
          productImageUrl: gptImages[0] ?? null,
          productImageUrls: gptImages,
          avatarImageUrls: personaForScripts,
          videoDurationSeconds: scriptTargetDurationSec,
          generationMode,
          customUgcIntent,
          provider: aiProvider,
        }),
      });
      if (!scriptsRes.ok) {
        const raw = await scriptsRes.text().catch(() => "");
        throw new Error(`UGC scripts failed: HTTP ${scriptsRes.status} ${raw.slice(0, 250)}`);
      }
      const scriptsJson = (await scriptsRes.json()) as { data?: string; error?: string };
      if (scriptsJson.error) throw new Error(scriptsJson.error);
      scriptsStr = String(scriptsJson?.data ?? "");
      scriptsStepOk = true;
    } catch (scriptErr) {
      scriptsError = scriptErr instanceof Error ? scriptErr.message : "Scripts step failed";
    }

    if (scriptsStepOk && scriptsStr) {
      report(4);
      const labels = deriveAngleLabelsFromScripts(scriptsStr);
      const snapAfterScripts: LinkToAdUniverseSnapshotV1 = {
        v: 1,
        phase: "after_scripts",
        generationMode,
        customUgcIntent,
        aiProvider,
        ltaVideoDurationSec: scriptTargetDurationSec,
        cleanCandidate: cleanUrl ? { url: cleanUrl, reason } : null,
        fallbackImageUrl: firstOther?.trim() || images[0] || null,
        confidence: confidenceStr,
        neutralUploadUrl: effectiveNeutral,
        productOnlyImageUrls: snapshotProductOnly.length ? snapshotProductOnly : undefined,
        personaPhotoUrls: personaForScripts.length ? personaForScripts : undefined,
        summaryText: summaryStr,
        scriptsText: scriptsStr,
        angleLabels: labels,
        selectedAngleIndex: null,
        ...UNIVERSE_PIPELINE_CLEAR,
      };
      const extractedScripts = { ...base, __universe: snapAfterScripts };
      activeRunId = await upsertViaApi(f, {
        runId: activeRunId,
        storeUrl: url,
        title: titleForScripts,
        extracted: extractedScripts,
        packshotUrls: shots,
      });
    }

    return {
      ok: true,
      runId: activeRunId,
      scriptsStepOk,
      ...(scriptsError ? { scriptsError } : {}),
      ...(suggestAdditionalProductPhotos ? { suggestAdditionalProductPhotos: true } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message, ...(activeRunId ? { runId: activeRunId } : {}) };
  }
}

export type ContinueScriptsResult =
  | { ok: true; runId: string; scriptsStepOk: true }
  | { ok: false; error: string; runId?: string };

/** Resume script generation from a saved run (after_summary) on the server. */
export async function runContinueScriptsPipeline(
  f: InternalFetch,
  runId: string,
  opts?: { videoDurationSeconds?: number },
): Promise<ContinueScriptsResult> {
  const getRes = await f(`/api/runs/get?runId=${encodeURIComponent(runId)}`, { method: "GET" });
  const getJson = (await getRes.json()) as {
    data?: {
      id: string;
      store_url?: string | null;
      title?: string | null;
      extracted?: unknown;
    };
    error?: string;
  };
  if (!getRes.ok || !getJson.data) {
    return { ok: false, error: getJson.error || "Could not load run." };
  }

  const run = getJson.data;
  const url = typeof run.store_url === "string" ? run.store_url.trim() : "";
  if (!url) return { ok: false, error: "Run has no store URL.", runId: run.id };

  const snap = readUniverseFromExtracted(run.extracted);
  if (!snap || !snap.summaryText.trim()) {
    return { ok: false, error: "Incomplete data to generate scripts.", runId: run.id };
  }
  const aiProvider = snap.aiProvider === "claude" ? "claude" : "gpt";

  const base = cloneExtractedBase(run.extracted);
  const generationMode = snap.generationMode === "custom_ugc" ? "custom_ugc" : "automatic";
  const customUgcIntent = (snap.customUgcIntent ?? "").trim();
  const titleForScripts = typeof run.title === "string" ? run.title : null;
  const candidates =
    snap.productOnlyImageUrls && snap.productOnlyImageUrls.length > 0
      ? snap.productOnlyImageUrls
      : snap.cleanCandidate?.url
        ? [snap.cleanCandidate.url]
        : [];
  const gptImages = productUrlsForGpt({
    pageUrl: url,
    neutralUploadUrl: snap.neutralUploadUrl,
    candidateUrls: candidates,
    fallbackUrl: snap.fallbackImageUrl,
  });

  const personaForScripts = (snap.personaPhotoUrls ?? [])
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));

  const scriptTargetDurationSec = normalizeUgcScriptVideoDurationSec(
    opts?.videoDurationSeconds ?? LINK_TO_AD_DEFAULT_VIDEO_DURATION_SEC,
  );

  try {
    const scriptsRes = await f("/api/gpt/ugc-scripts-from-brief", {
      method: "POST",
      body: JSON.stringify({
        storeUrl: url,
        productTitle: titleForScripts,
        brandBrief: snap.summaryText,
        productImageUrl: gptImages[0] ?? null,
        productImageUrls: gptImages,
        avatarImageUrls: personaForScripts,
        videoDurationSeconds: scriptTargetDurationSec,
        generationMode,
        customUgcIntent,
        provider: aiProvider,
      }),
    });
    if (!scriptsRes.ok) {
      const raw = await scriptsRes.text().catch(() => "");
      throw new Error(`UGC scripts failed: HTTP ${scriptsRes.status} ${raw.slice(0, 250)}`);
    }
    const scriptsJson = (await scriptsRes.json()) as { data?: string; error?: string };
    if (scriptsJson.error) throw new Error(scriptsJson.error);
    const scriptsStr = String(scriptsJson?.data ?? "");
    if (!scriptsStr.trim()) throw new Error("Empty scripts response.");

    const labels = deriveAngleLabelsFromScripts(scriptsStr);
    const snapAfterScripts: LinkToAdUniverseSnapshotV1 = {
      v: 1,
      phase: "after_scripts",
      generationMode,
      customUgcIntent,
      cleanCandidate: snap.cleanCandidate,
      fallbackImageUrl: snap.fallbackImageUrl,
      confidence: snap.confidence,
      neutralUploadUrl: snap.neutralUploadUrl,
      productOnlyImageUrls: candidates.length ? candidates : undefined,
      personaPhotoUrls: snap.personaPhotoUrls?.length ? snap.personaPhotoUrls : undefined,
      summaryText: snap.summaryText,
      scriptsText: scriptsStr,
      angleLabels: labels,
      selectedAngleIndex: null,
      ...UNIVERSE_PIPELINE_CLEAR,
    };
    const shots = gptImages.length > 0 ? gptImages : [];
    await upsertViaApi(f, {
      runId: run.id,
      storeUrl: url,
      title: titleForScripts,
      extracted: { ...base, __universe: snapAfterScripts },
      packshotUrls: shots,
    });

    return { ok: true, runId: run.id, scriptsStepOk: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scripts step failed";
    return { ok: false, error: message, runId: run.id };
  }
}
