"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { absolutizeImageUrl } from "@/lib/imageUrl";

type ProductCandidate = { url: string; reason?: string } | string;

function confidenceToQuality(c: string | undefined) {
  const v = String(c ?? "").toLowerCase();
  if (v === "high") return { label: "good", color: "text-emerald-400", help: "Clean product image looks strong." };
  if (v === "medium") return { label: "medium", color: "text-amber-300", help: "Image is usable but not perfect. Upload a neutral product-only photo for best results." };
  return { label: "bad", color: "text-destructive", help: "Low confidence. Upload a neutral product-only photo (no background, no people) for best results." };
}

function safeParseJson<T>(raw: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return { ok: false, error: "Invalid JSON from server." };
  }
}

export default function LinkToAdUniverse() {
  const [storeUrl, setStoreUrl] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [extractedTitle, setExtractedTitle] = useState<string | null>(null);

  const [cleanCandidate, setCleanCandidate] = useState<{ url: string; reason?: string } | null>(null);
  const [fallbackImageUrl, setFallbackImageUrl] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [neutralUploadUrl, setNeutralUploadUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const [summaryText, setSummaryText] = useState<string>("");
  const [stage, setStage] = useState<"idle" | "scanning" | "finding_image" | "summarizing" | "ready" | "error">("idle");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const quality = useMemo(() => confidenceToQuality(confidence ?? undefined), [confidence]);
  const displayedProductImageUrl = neutralUploadUrl ?? cleanCandidate?.url ?? fallbackImageUrl ?? null;

  /** Avoid relative URLs (e.g. /cdn/shop/...) resolving to our app origin → 404 in <img> and "Open image". */
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

  async function onRun() {
    const url = storeUrl.trim();
    if (!url) {
      toast.error("Missing URL");
      return;
    }

    setIsWorking(true);
    setSummaryText("");
    setExtractedTitle(null);
    setCleanCandidate(null);
    setFallbackImageUrl(null);
    setNeutralUploadUrl(null);
    setConfidence(null);
    setImgError(false);

    try {
      setStage("scanning");
      // 1) Extract product page context
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

      const images: string[] = Array.isArray(extractedObj.images)
        ? extractedObj.images.filter((x): x is string => typeof x === "string")
        : [];
      if (!images.length) {
        throw new Error("No images found on that page.");
      }

      // 2) Find clean product-only image
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
        const u = obj?.url;
        if (typeof u === "string") {
          return {
            url: u.trim(),
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

      // 3) Summarize brand with GPT using URL + prompt
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
      setSummaryText(String(summaryJson?.data ?? ""));

      setStage("ready");
      toast.success("Universe scan complete");
    } catch (err) {
      setStage("error");
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error("Universe error", { description: message });
    } finally {
      setIsWorking(false);
    }
  }

  const showUploadRecommendation = quality.label === "medium" || quality.label === "bad";

  return (
    <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.10)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Link to Ad Universe</CardTitle>
            <p className="mt-1 text-sm text-white/55">
              Scan your store, extract a clean product image, then generate an English brand brief.
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
            <Button
              type="button"
              onClick={onRun}
              disabled={isWorking}
              className="h-11 rounded-2xl bg-violet-400 px-6 text-black border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px]"
            >
              {isWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isWorking ? "Scanning..." : "Generate"}
            </Button>
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
                        // reset input so the same file can be uploaded twice
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
      </CardContent>
    </Card>
  );
}

