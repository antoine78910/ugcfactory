"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Loader2, Sparkles } from "lucide-react";
import type { TTAd, TTLookupResult } from "@/lib/trendtrack";
import { TrackerSearch } from "./TrackerSearch";
import { CreditsChip } from "./CreditsChip";
import { CompetitorsPanel } from "./CompetitorsPanel";
import type { IntelligenceCompetitor } from "@/app/api/intelligence/competitors/route";
import { cn } from "@/lib/utils";
import { AdCard } from "./AdCard";
import { HooksTable } from "./HooksTable";
import { Copy } from "lucide-react";

type StepId = 1 | 2 | 3 | 4;

function Stepper({ step }: { step: StepId }) {
  const items: Array<{ id: StepId; label: string }> = [
    { id: 1, label: "Your brand" },
    { id: 2, label: "Competitors" },
    { id: 3, label: "Top ads" },
    { id: 4, label: "Recreate" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {items.map((it) => {
        const done = it.id < step;
        const active = it.id === step;
        return (
          <div key={it.id} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold",
                done && "border-violet-400/45 bg-violet-500/15 text-violet-100",
                active && "border-violet-400/70 bg-violet-400 text-black",
                !done && !active && "border-white/10 bg-white/[0.03] text-white/45",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : it.id}
            </span>
            <span className={cn("text-xs font-medium", active ? "text-white" : "text-white/45")}>
              {it.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

async function fetchSavedCompetitors(): Promise<IntelligenceCompetitor[]> {
  const res = await fetch("/api/intelligence/competitors");
  const json = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(json) ? (json as IntelligenceCompetitor[]) : [];
}

async function fetchTopAdsForCompetitor(opts: {
  lookupId: string;
  q: string;
  sortBy: string;
}): Promise<TTAd[]> {
  const res = await fetch(
    `/api/intelligence/competitors/top-ads?lookupId=${encodeURIComponent(
      opts.lookupId,
    )}&q=${encodeURIComponent(opts.q)}&sortBy=${encodeURIComponent(opts.sortBy)}`,
  );
  const json = (await res.json().catch(() => ({}))) as any;
  const ads = Array.isArray(json?.ads) ? (json.ads as TTAd[]) : Array.isArray(json) ? (json as TTAd[]) : [];
  return ads.map((a, i) => ({ ...a, rank: i + 1 }));
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return `$${Math.round(n).toLocaleString("en-US")}`;
  if (n >= 10) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(1)}`;
}

function similarNicheQueryFromBrandName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
  return tokens[0] ?? "";
}

function dedupeLookupRows(rows: TTLookupResult[], brandId: string | null): TTLookupResult[] {
  const seen = new Set<string>();
  const out: TTLookupResult[] = [];
  for (const r of rows) {
    const id = (r.id ?? "").trim();
    if (!id) continue;
    if (brandId && id === brandId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

export function IntelligenceOnboarding({
  onDone,
}: {
  onDone: () => void;
}) {
  const [step, setStep] = useState<StepId>(1);

  // Step 1 — brand
  const [brand, setBrand] = useState<TTLookupResult | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandError, setBrandError] = useState<string | null>(null);

  // Step 2/3 — saved competitors
  const [savedCompetitors, setSavedCompetitors] = useState<IntelligenceCompetitor[]>([]);
  const savedCount = savedCompetitors.length;
  const [autoCompetitorSuggestions, setAutoCompetitorSuggestions] = useState<TTLookupResult[]>([]);
  const [autoCompetitorLoading, setAutoCompetitorLoading] = useState(false);
  const [autoCompetitorMessage, setAutoCompetitorMessage] = useState<string | null>(null);
  const [autoSavingIds, setAutoSavingIds] = useState<string[]>([]);

  const refreshSavedCompetitors = useCallback(async () => {
    const rows = await fetchSavedCompetitors();
    setSavedCompetitors(rows.slice(0, 3));
  }, []);

  useEffect(() => {
    void refreshSavedCompetitors();
  }, [refreshSavedCompetitors]);

  const autoSearchCompetitors = useCallback(async () => {
    if (!brand) {
      setAutoCompetitorSuggestions([]);
      setAutoCompetitorMessage(null);
      return;
    }
    setAutoCompetitorLoading(true);
    setAutoCompetitorMessage(null);
    try {
      const primary = (brand.domain?.trim() || brand.name?.trim() || "").trim();
      if (!primary) {
        setAutoCompetitorSuggestions([]);
        setAutoCompetitorMessage("we didn't find competitors for you");
        return;
      }

      const runLookup = async (q: string): Promise<TTLookupResult[]> => {
        if (!q.trim()) return [];
        const res = await fetch(
          `/api/intelligence/lookup?q=${encodeURIComponent(q)}&type=${encodeURIComponent("advertiser")}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => [])) as unknown;
        return Array.isArray(json) ? (json as TTLookupResult[]) : [];
      };

      const primaryRows = await runLookup(primary);
      const fallbackToken = similarNicheQueryFromBrandName(brand.name ?? "");
      const fallbackRows = primaryRows.length > 0 || !fallbackToken || fallbackToken === primary
        ? []
        : await runLookup(fallbackToken);
      const merged = dedupeLookupRows([...primaryRows, ...fallbackRows], brand.id).slice(0, 8);

      setAutoCompetitorSuggestions(merged);
      if (merged.length === 0) {
        setAutoCompetitorMessage("we didn't find competitors for you");
      } else {
        setAutoCompetitorMessage(null);
      }
    } catch {
      setAutoCompetitorSuggestions([]);
      setAutoCompetitorMessage("we didn't find competitors for you");
    } finally {
      setAutoCompetitorLoading(false);
    }
  }, [brand]);

  useEffect(() => {
    if (step !== 2) return;
    void autoSearchCompetitors();
  }, [autoSearchCompetitors, step]);

  const saveSuggestedCompetitor = useCallback(async (s: TTLookupResult) => {
    const sid = s.id.trim();
    if (!sid) return;
    if (savedCompetitors.some((c) => (c.lookupId ?? c.id) === sid)) return;
    if (savedCompetitors.length >= 3) return;
    setAutoSavingIds((prev) => (prev.includes(sid) ? prev : [...prev, sid]));
    try {
      const res = await fetch("/api/intelligence/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookupId: sid,
          name: s.name,
          domain: s.domain ?? null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      await refreshSavedCompetitors();
    } catch {
      // Keep UX lightweight: panel/manual save remains available if this quick-add fails.
    } finally {
      setAutoSavingIds((prev) => prev.filter((x) => x !== sid));
    }
  }, [refreshSavedCompetitors, savedCompetitors]);

  const canContinueStep1 = Boolean(brand);
  const saveBrand = useCallback(async () => {
    if (!brand || savingBrand) return;
    setSavingBrand(true);
    setBrandError(null);
    try {
      const res = await fetch("/api/intelligence/trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracker_id: brand.id,
          name: brand.name,
          logo: brand.logo ?? brand.logoUrl ?? null,
          domain: brand.domain ?? null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save your brand.");
      setStep(2);
    } catch (e) {
      setBrandError(e instanceof Error ? e.message : "Could not save your brand.");
    } finally {
      setSavingBrand(false);
    }
  }, [brand, savingBrand]);

  // Step 3 — top ads
  const [activeCompetitorId, setActiveCompetitorId] = useState<string | null>(null);
  const activeCompetitor = useMemo(() => {
    if (!activeCompetitorId) return savedCompetitors[0] ?? null;
    return savedCompetitors.find((c) => c.id === activeCompetitorId) ?? savedCompetitors[0] ?? null;
  }, [activeCompetitorId, savedCompetitors]);

  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [ads, setAds] = useState<TTAd[]>([]);
  const [selectedAd, setSelectedAd] = useState<TTAd | null>(null);

  const loadTopAds = useCallback(async () => {
    const c = activeCompetitor;
    if (!c) return;
    setAdsLoading(true);
    setAdsError(null);
    try {
      const lookupId = c.lookupId ?? c.id;
      const q = c.domain?.trim() || c.name?.trim() || lookupId;
      const out = await fetchTopAdsForCompetitor({ lookupId, q, sortBy: "currentRank" });
      setAds(out.filter((a) => Boolean(a.videoUrl && a.videoUrl.trim())).slice(0, 10));
    } catch {
      setAdsError("Could not load competitor ads.");
      setAds([]);
    } finally {
      setAdsLoading(false);
    }
  }, [activeCompetitor]);

  useEffect(() => {
    if (step !== 3 && step !== 4) return;
    void refreshSavedCompetitors().then(() => void loadTopAds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step !== 3 && step !== 4) return;
    void loadTopAds();
  }, [activeCompetitor?.id, loadTopAds, step]);

  const stats = useMemo(() => {
    const count = ads.length;
    const avgDays =
      count > 0
        ? Math.round(
            ads.map((a) => a.daysRunning ?? 0).reduce((acc, n) => acc + n, 0) / Math.max(1, count),
          )
        : 0;
    const totalSpend = ads.map((a) => a.spend ?? 0).reduce((acc, n) => acc + n, 0);
    const pctLong = count > 0 ? Math.round((ads.filter((a) => (a.daysRunning ?? 0) >= 14).length / count) * 100) : 0;
    return { count, avgDays, totalSpend, pctLong };
  }, [ads]);

  const bestScripts = useMemo(() => {
    const rows = ads
      .map((ad) => {
        const hook = (ad.headline ?? ad.title ?? "").trim();
        const script = (ad.body ?? ad.text ?? "").trim();
        const score = (ad.spend ?? 0) * 2 + (ad.reach ?? 0) + (ad.impressions ?? 0) * 0.25;
        return { hook, script, score };
      })
      .filter((r) => r.script.length >= 18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const seen = new Set<string>();
    return rows.filter((r) => {
      const key = r.script.slice(0, 120).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [ads]);

  // Step 4 — simple hook variations (lightweight, no extra API/credits)
  const hook = useMemo(() => {
    if (!selectedAd) return "";
    return (selectedAd.headline ?? selectedAd.title ?? selectedAd.body ?? "").trim();
  }, [selectedAd]);
  const [product, setProduct] = useState("");

  const variations = useMemo(() => {
    const h = hook.trim();
    const p = product.trim();
    if (!h || !p) return [];
    const base = h.replace(/\b(we|our)\b/gi, "you").replace(/\s+/g, " ").trim();
    return [
      {
        id: "direct",
        title: "Direct adaptation",
        text: `${base} — with ${p}.`,
      },
      {
        id: "emotional",
        title: "Emotional rewrite",
        text: `If ${h.slice(0, 80)}… you’ll feel the difference with ${p}.`,
      },
      {
        id: "genz",
        title: "Gen Z version",
        text: `${h.slice(0, 70)}… but make it ${p}. Lowkey obsessed.`,
      },
    ];
  }, [hook, product]);

  return (
    <div className="min-h-full bg-[#0b0912] p-6">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white/90">Set up Intelligence</h2>
              <p className="mt-1 text-xs text-white/45">
                One-time setup. You can edit trackers and competitors later.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-emerald-300/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100">
                Provider connected
              </span>
              <CreditsChip />
            </div>
          </div>

          <div className="mt-4">
            <Stepper step={step} />
          </div>
        </div>

        {/* Step bodies */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-white/85">Your brand</p>
                <p className="mt-1 text-xs text-white/45">
                  Enter your brand domain or name to connect TrendTrack. If you don’t have it yet, you can skip and start with competitors.
                </p>
              </div>

              <TrackerSearch onResult={setBrand} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
                    Selected
                  </p>
                  <p className="mt-1 text-sm text-white/85">{brand ? brand.name : "—"}</p>
                  <p className="mt-0.5 text-xs text-white/45">{brand?.domain?.trim() || ""}</p>
                </div>
              </div>

              {brandError ? <p className="text-xs text-red-400">{brandError}</p> : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/[0.06]"
                  title="Skip brand connection"
                >
                  Don’t have my Meta Ads Account right now
                </button>
                <button
                  type="button"
                  onClick={saveBrand}
                  disabled={!canContinueStep1 || savingBrand}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] transition hover:bg-violet-300 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.95)] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
                >
                  {savingBrand ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white/85">Competitors</p>
                  <p className="mt-1 text-xs text-white/45">
                    Save up to 3 competitors to keep credits under control.
                  </p>
                </div>
                <span className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs font-semibold text-white/70">
                  {savedCount}/3 saved
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-3 rounded-xl border border-violet-400/20 bg-violet-500/8 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-100/80">
                      Suggested for your brand
                    </p>
                    {autoCompetitorLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-200/75" /> : null}
                  </div>
                  {autoCompetitorSuggestions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {autoCompetitorSuggestions.map((s) => {
                        const sid = s.id.trim();
                        const alreadySaved = savedCompetitors.some((c) => (c.lookupId ?? c.id) === sid);
                        const saving = autoSavingIds.includes(sid);
                        const blocked = !alreadySaved && savedCount >= 3;
                        return (
                          <button
                            key={sid}
                            type="button"
                            disabled={alreadySaved || saving || blocked}
                            onClick={() => void saveSuggestedCompetitor(s)}
                            className={cn(
                              "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition",
                              alreadySaved
                                ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
                                : "border-violet-300/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20",
                              (saving || blocked) && "opacity-60",
                            )}
                            title={alreadySaved ? "Already saved" : blocked ? "You can save up to 3 competitors." : "Add competitor"}
                          >
                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            <span>{s.name}</span>
                            <span className="text-[10px] text-white/60">{alreadySaved ? "Saved" : "Add"}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : autoCompetitorLoading ? (
                    <p className="mt-2 text-xs text-violet-100/70">Finding similar shops and niche competitors…</p>
                  ) : autoCompetitorMessage ? (
                    <p className="mt-2 text-xs text-violet-100/70">{autoCompetitorMessage}</p>
                  ) : null}
                </div>
                <CompetitorsPanel
                  maxSaved={3}
                  sortBy="currentRank"
                  onSortBy={() => {}}
                  onPick={() => {}}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/[0.06]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await refreshSavedCompetitors();
                    setStep(3);
                  }}
                  disabled={savedCount === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] transition hover:bg-violet-300 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.95)] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-white/85">Top ads</p>
                <p className="mt-1 text-xs text-white/45">
                  Review the best creatives and hit <span className="font-semibold text-white/70">Recreate</span> on any ad.
                </p>
              </div>

              {savedCompetitors.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {savedCompetitors.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveCompetitorId(c.id)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                        (activeCompetitor?.id ?? savedCompetitors[0]?.id) === c.id
                          ? "border-violet-400/50 bg-violet-500/15 text-white"
                          : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/45">No competitors saved yet.</p>
              )}

              {activeCompetitor ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white/85">{activeCompetitor.name}</p>
                      <p className="mt-0.5 text-xs text-white/45">{activeCompetitor.domain ?? ""}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/70">
                        {stats.count} ads
                      </span>
                      <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/70">
                        Avg {stats.avgDays}d running
                      </span>
                      <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/70">
                        Est. spend {formatUsd(stats.totalSpend)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-violet-400/15 bg-violet-500/5 p-3 text-xs text-violet-100/80">
                    Dominant pattern: <span className="font-semibold">{stats.pctLong}%</span> of these top ads have been running{" "}
                    <span className="font-semibold">14+ days</span>.
                  </div>

                  {adsLoading ? (
                    <div className="mt-4 flex items-center gap-2 text-xs text-white/55">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading top ads…
                    </div>
                  ) : adsError ? (
                    <p className="mt-4 text-xs text-red-400">{adsError}</p>
                  ) : ads.length === 0 ? (
                    <p className="mt-4 text-xs text-white/45">No video ads found.</p>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {ads.map((ad) => (
                        <div key={ad.id}>
                          <AdCard
                            ad={ad}
                            brandName={activeCompetitor.name}
                            playVideoOnHover
                            showRecreateShortcut
                            onView={() => setSelectedAd(ad)}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {!adsLoading && !adsError && ads.length > 0 ? (
                    <div className="mt-5 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                          Best hooks
                        </h4>
                        <HooksTable
                          ads={ads}
                          brandSlug={activeCompetitor.name?.toLowerCase().replace(/\s+/g, "-")}
                        />
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                          Best scripts
                        </h4>
                        {bestScripts.length === 0 ? (
                          <p className="text-xs text-white/45">No script text found on these ads.</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {bestScripts.map((s, idx) => (
                              <div
                                key={idx}
                                className="rounded-xl border border-white/10 bg-black/20 p-3"
                              >
                                {s.hook ? (
                                  <p className="text-xs font-semibold text-white/80">
                                    “{s.hook.slice(0, 110)}”
                                  </p>
                                ) : null}
                                <p className={cn("mt-1 text-xs leading-relaxed text-white/55", !s.hook && "mt-0")}>
                                  {s.script}
                                </p>
                                <div className="mt-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(s.script);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-violet-400/35 hover:text-white"
                                    title="Copy script"
                                  >
                                    <Copy className="h-3 w-3" />
                                    Copy
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/[0.06]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  disabled={!selectedAd}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] transition hover:bg-violet-300 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.95)] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
                  title={!selectedAd ? "Open any ad to continue." : "Continue"}
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-white/85">Recreate</p>
                <p className="mt-1 text-xs text-white/45">
                  We&apos;ll keep it simple: pick your product, get 3 hook variations, then generate the video script.
                </p>
              </div>

              {!selectedAd ? (
                <p className="text-xs text-white/45">Go back and select an ad first.</p>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
                    Source hook
                  </p>
                  <p className="mt-1 text-sm text-white/80">{hook || "—"}</p>

                  <div className="mt-4">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
                      Your product
                    </label>
                    <input
                      value={product}
                      onChange={(e) => setProduct(e.target.value)}
                      placeholder="e.g. Aurora Glow vitamin-C serum"
                      className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white/85 outline-none focus:border-violet-500/50"
                    />
                  </div>

                  {variations.length > 0 ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      {variations.map((v) => (
                        <div key={v.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <p className="text-xs font-semibold text-white/80">{v.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-white/55">{v.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-white/45">
                      Add your product to see variations.
                    </p>
                  )}

                  <div className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/8 p-3 text-xs text-white/70">
                    Tip: click <span className="font-semibold">Recreate</span> on the ad card to open the full script + Seedance generation flow.
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/[0.06]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={onDone}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] transition hover:bg-violet-300 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.95)] active:translate-y-[2px] active:shadow-none"
                >
                  <Sparkles className="h-4 w-4" />
                  Finish and open dashboard
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

