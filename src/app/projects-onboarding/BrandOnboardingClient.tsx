"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Step = 1 | 2 | 3;

type CrawlPage = { url: string; title?: string | null; textSample: string };

type MarketingAngle = { id: string; label: string; rationale?: string; evidence?: string };

type SiteAnalysis = {
  brand_summary: string;
  problems_solved: string[];
  marketing_angles: Array<{ label: string; rationale?: string; evidence?: string }>;
  positioning: string;
  icp_summary: string;
  key_messaging_pillars: string[];
  site_structure_notes: string;
  risks_or_gaps: string[];
};

type SitePack = {
  siteUrl: string;
  siteName: string | null;
  sitePages: CrawlPage[];
  crawlErrors: string[];
  siteAnalysis: SiteAnalysis;
  marketingAngles: MarketingAngle[];
};

type CompetitorRow = {
  input_name: string;
  input_domain?: string | null;
  trendtrack_lookup?: unknown;
  trendtrack_ads: unknown[];
  website_text_sample?: string;
  claude: {
    summary: string;
    positioning_vs_you?: string;
    ad_patterns: string[];
    angles_they_stress: string[];
    gaps_you_can_attack: string[];
  };
};

type OnboardingDraftPersisted = {
  siteUrl: string;
  siteName: string;
  sitePack: SitePack | null;
  competitors: Array<{ name: string; domain: string }>;
  compRows: CompetitorRow[] | null;
  projectTitle: string;
};

function Stepper({ step }: { step: Step }) {
  const items: Array<{ id: Step; label: string }> = [
    { id: 1, label: "Your site" },
    { id: 2, label: "Competitors" },
    { id: 3, label: "Save project" },
  ];
  return (
    <div className="mb-8 flex flex-wrap items-center justify-center gap-3 text-xs">
      {items.map((it) => {
        const done = it.id < step;
        const active = it.id === step;
        return (
          <div key={it.id} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold",
                done && "border-emerald-400/50 bg-emerald-500/15 text-emerald-100",
                active && "border-violet-400/70 bg-violet-400 text-black",
                !done && !active && "border-white/10 bg-white/[0.03] text-white/45",
              )}
            >
              {it.id}
            </span>
            <span className={cn("font-medium", active ? "text-white" : "text-white/45")}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function BrandOnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  const [siteUrl, setSiteUrl] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteLoading, setSiteLoading] = useState(false);
  const [sitePack, setSitePack] = useState<SitePack | null>(null);

  const [competitors, setCompetitors] = useState<Array<{ name: string; domain: string }>>([
    { name: "", domain: "" },
  ]);
  const [compLoading, setCompLoading] = useState(false);
  const [compRows, setCompRows] = useState<CompetitorRow[] | null>(null);

  const [projectTitle, setProjectTitle] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  const skipDraftSaveRef = useRef(true);

  const canAnalyzeSite = useMemo(() => siteUrl.trim().length > 3, [siteUrl]);

  const runSiteAnalysis = useCallback(async () => {
    if (!canAnalyzeSite) return;
    setSiteLoading(true);
    setSitePack(null);
    try {
      const res = await fetch("/api/onboarding/brand/analyze-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          siteUrl: siteUrl.trim(),
          siteName: siteName.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string } & Partial<SitePack>;
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const pack = json as SitePack;
      setSitePack(pack);
      const hostHint = (() => {
        try {
          return new URL(pack.siteUrl.startsWith("http") ? pack.siteUrl : `https://${pack.siteUrl}`).hostname;
        } catch {
          return pack.siteUrl.slice(0, 80);
        }
      })();
      setProjectTitle((siteName.trim() || hostHint).slice(0, 120));
      toast.success("Site analysis ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Site analysis failed.");
    } finally {
      setSiteLoading(false);
    }
  }, [canAnalyzeSite, siteName, siteUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/onboarding/brand/draft", { cache: "no-store", credentials: "include" });
        const json = (await res.json().catch(() => null)) as unknown;
        if (cancelled) return;
        if (!res.ok) return;
        if (json === null || json === undefined) return;
        if (typeof json !== "object") return;
        const o = json as Record<string, unknown>;
        if (typeof o.error === "string") return;
        if (!("step" in o) || !("state" in o)) return;

        const st = o.state;
        if (!st || typeof st !== "object") return;
        const s = st as Partial<OnboardingDraftPersisted>;
        if (typeof s.siteUrl === "string") setSiteUrl(s.siteUrl);
        if (typeof s.siteName === "string") setSiteName(s.siteName);
        if (s.sitePack && typeof s.sitePack === "object") setSitePack(s.sitePack as SitePack);
        if (Array.isArray(s.competitors) && s.competitors.length > 0) {
          setCompetitors(
            s.competitors.map((row) => ({
              name: typeof row?.name === "string" ? row.name : "",
              domain: typeof row?.domain === "string" ? row.domain : "",
            })),
          );
        }
        if (Array.isArray(s.compRows)) setCompRows(s.compRows as CompetitorRow[]);
        if (typeof s.projectTitle === "string") setProjectTitle(s.projectTitle);
        const stepRaw = Number(o.step);
        const loadedStep: Step = stepRaw === 2 || stepRaw === 3 ? (stepRaw as Step) : 1;
        setStep(loadedStep);
        toast.info("Restored your saved onboarding progress.");
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          window.setTimeout(() => {
            skipDraftSaveRef.current = false;
          }, 500);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (skipDraftSaveRef.current) return;
    const tid = window.setTimeout(() => {
      const state: OnboardingDraftPersisted = {
        siteUrl,
        siteName,
        sitePack,
        competitors,
        compRows,
        projectTitle,
      };
      void fetch("/api/onboarding/brand/draft", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, state }),
      }).catch(() => {});
    }, 900);
    return () => window.clearTimeout(tid);
  }, [step, siteUrl, siteName, sitePack, competitors, compRows, projectTitle]);

  const runCompetitorAnalysis = useCallback(async () => {
    if (!sitePack) return;
    const rows = competitors
      .map((c) => ({ name: c.name.trim(), domain: c.domain.trim() || undefined }))
      .filter((c) => c.name.length > 0);
    if (rows.length === 0) {
      toast.error("Add at least one competitor name.");
      return;
    }
    setCompLoading(true);
    setCompRows(null);
    try {
      const res = await fetch("/api/onboarding/brand/analyze-competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          siteUrl: sitePack.siteUrl,
          brandSummary: sitePack.siteAnalysis.brand_summary,
          competitors: rows.map((r) => ({ name: r.name, domain: r.domain })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; competitors?: CompetitorRow[] };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setCompRows(json.competitors ?? []);
      toast.success("Competitor analysis ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Competitor analysis failed.");
    } finally {
      setCompLoading(false);
    }
  }, [competitors, sitePack]);

  const saveProject = useCallback(async () => {
    if (!sitePack) return;
    const title = projectTitle.trim();
    if (!title) {
      toast.error("Enter a project title.");
      return;
    }
    setSaveLoading(true);
    try {
      const res = await fetch("/api/onboarding/brand/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          site_url: sitePack.siteUrl,
          site_name: sitePack.siteName,
          site_pages: sitePack.sitePages,
          site_analysis: sitePack.siteAnalysis,
          marketing_angles: sitePack.marketingAngles,
          competitors: compRows ?? [],
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (!json.id) throw new Error("Missing project id.");
      await fetch("/api/onboarding/brand/draft", { method: "DELETE", credentials: "include" }).catch(() => {});
      toast.success("Project saved.");
      router.push(`/projects-onboarding/projects/${encodeURIComponent(json.id)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaveLoading(false);
    }
  }, [compRows, projectTitle, sitePack]);

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-[#050507] text-white antialiased">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#050507]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <Link href="/" className="flex shrink-0 items-center outline-none transition-opacity hover:opacity-95">
            <Image src="/youry-logo.png" alt="Youry" width={174} height={52} className="h-8 w-auto sm:h-9" priority />
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <Link href="/projects-onboarding/projects" className="text-white/55 hover:text-white">
              My projects
            </Link>
            <span className="text-white/20">|</span>
            <Link href="/onboarding" className="text-white/55 hover:text-white">
              Account onboarding
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-0 h-[280px] w-[min(100vw,560px)] -translate-x-1/2 rounded-full bg-violet-600/[0.07] blur-[90px]"
          aria-hidden
        />
        <div className="relative z-10">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Brand & competitor onboarding</h1>
            <p className="mx-auto mt-2 max-w-xl text-sm text-white/55">
              We crawl your site, analyze positioning with Claude Sonnet 4.6, then enrich competitors with TrendTrack
              ads plus a second Claude pass. Each step auto-saves to your account so you can leave and resume. Final
              results also live under{" "}
              <Link href="/projects-onboarding/projects" className="text-violet-300 hover:underline">
                My projects
              </Link>{" "}
              for ongoing edits.
            </p>
          </div>

          <Stepper step={step} />

          {step === 1 ? (
            <Card className="border-white/10 bg-white/[0.03] shadow-none">
              <CardHeader>
                <CardTitle>Your website</CardTitle>
                <CardDescription className="text-white/55">
                  Paste your homepage URL (we crawl this host only, shallow depth).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Site URL</Label>
                  <Input
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="https://yourbrand.com"
                    className="border-white/15 bg-black/35 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Brand / site name (optional)</Label>
                  <Input
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    placeholder="How you want the project titled"
                    className="border-white/15 bg-black/35 text-white"
                  />
                </div>
                <Button
                  type="button"
                  disabled={!canAnalyzeSite || siteLoading}
                  onClick={() => void runSiteAnalysis()}
                  className="bg-violet-400 text-black hover:bg-violet-300"
                >
                  {siteLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {siteLoading ? "Analyzing…" : "Analyze with Claude"}
                </Button>

                {sitePack ? (
                  <div className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-white/80">
                    <div className="font-medium text-white">Summary</div>
                    <p>{sitePack.siteAnalysis.brand_summary}</p>
                    <div className="font-medium text-white">Problems solved</div>
                    <ul className="list-disc space-y-1 pl-5">
                      {sitePack.siteAnalysis.problems_solved.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                    <div className="font-medium text-white">Marketing angles</div>
                    <ul className="list-disc space-y-1 pl-5">
                      {sitePack.marketingAngles.map((a) => (
                        <li key={a.id}>
                          <span className="text-white">{a.label}</span>
                          {a.rationale ? <span className="text-white/60"> — {a.rationale}</span> : null}
                        </li>
                      ))}
                    </ul>
                    {sitePack.crawlErrors.length > 0 ? (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-100/90">
                        Some URLs could not be fetched: {sitePack.crawlErrors.slice(0, 4).join(" · ")}
                      </div>
                    ) : null}
                    <Button type="button" className="mt-2 bg-white/10 text-white hover:bg-white/15" onClick={() => setStep(2)}>
                      Next: competitors
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <Card className="border-white/10 bg-white/[0.03] shadow-none">
              <CardHeader>
                <CardTitle>Competitors</CardTitle>
                <CardDescription className="text-white/55">
                  Up to five names. Add domains when you have them — TrendTrack resolves ads better with domains.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!sitePack ? (
                  <p className="text-sm text-white/50">Complete step 1 first.</p>
                ) : (
                  <>
                    {competitors.map((row, idx) => (
                      <div key={idx} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/25 p-3 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Competitor name</Label>
                          <Input
                            value={row.name}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCompetitors((prev) => prev.map((p, i) => (i === idx ? { ...p, name: v } : p)));
                            }}
                            placeholder="e.g. Acme"
                            className="border-white/15 bg-black/35 text-white"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Domain (optional)</Label>
                          <Input
                            value={row.domain}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCompetitors((prev) => prev.map((p, i) => (i === idx ? { ...p, domain: v } : p)));
                            }}
                            placeholder="acme.com"
                            className="border-white/15 bg-black/35 text-white"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-white/50 hover:text-red-300"
                          disabled={competitors.length <= 1}
                          onClick={() => setCompetitors((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Remove competitor row"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                      disabled={competitors.length >= 5}
                      onClick={() => setCompetitors((prev) => [...prev, { name: "", domain: "" }])}
                    >
                      <Plus className="mr-2 size-4" />
                      Add competitor
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" className="border-white/15 bg-white/10 text-white" onClick={() => setStep(1)}>
                        Back
                      </Button>
                      <Button
                        type="button"
                        disabled={compLoading}
                        onClick={() => void runCompetitorAnalysis()}
                        className="bg-violet-400 text-black hover:bg-violet-300"
                      >
                        {compLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {compLoading ? "Analyzing…" : "Run TrendTrack + Claude"}
                      </Button>
                      <Button type="button" variant="ghost" className="text-white/70" onClick={() => setStep(3)}>
                        Skip to save
                      </Button>
                    </div>

                    {compRows ? (
                      <div className="space-y-3 text-sm text-white/80">
                        {compRows.map((c, i) => (
                          <div key={`${c.input_name}-${i}`} className="rounded-lg border border-white/10 bg-black/30 p-3">
                            <div className="font-medium text-white">{c.input_name}</div>
                            <p className="mt-2">{c.claude.summary}</p>
                            {c.claude.angles_they_stress?.length ? (
                              <div className="mt-2 text-xs text-white/60">
                                Angles they stress: {c.claude.angles_they_stress.join("; ")}
                              </div>
                            ) : null}
                          </div>
                        ))}
                        <Button type="button" className="bg-white/10 text-white hover:bg-white/15" onClick={() => setStep(3)}>
                          Next: save project
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {step === 3 ? (
            <Card className="border-white/10 bg-white/[0.03] shadow-none">
              <CardHeader>
                <CardTitle>Save to My projects</CardTitle>
                <CardDescription className="text-white/55">
                  You can edit marketing angles and competitors later from the project page.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!sitePack ? (
                  <p className="text-sm text-white/50">Complete step 1 first.</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Project title</Label>
                      <Input
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                        className="border-white/15 bg-black/35 text-white"
                      />
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-white/55">
                      Site: {sitePack.siteUrl} · Angles: {sitePack.marketingAngles.length} · Competitors analyzed:{" "}
                      {compRows?.length ?? 0}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" className="border-white/15 bg-white/10 text-white" onClick={() => setStep(2)}>
                        Back
                      </Button>
                      <Button
                        type="button"
                        disabled={saveLoading}
                        onClick={() => void saveProject()}
                        className="bg-violet-400 text-black hover:bg-violet-300"
                      >
                        {saveLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        {saveLoading ? "Saving…" : "Save project"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          <div className="mt-8 flex justify-center gap-2 text-xs text-white/40">
            <button type="button" className={step === 1 ? "text-violet-300" : "hover:text-white/70"} onClick={() => setStep(1)}>
              Step 1
            </button>
            <span>·</span>
            <button
              type="button"
              className={step === 2 ? "text-violet-300" : "hover:text-white/70"}
              onClick={() => sitePack && setStep(2)}
            >
              Step 2
            </button>
            <span>·</span>
            <button type="button" className={step === 3 ? "text-violet-300" : "hover:text-white/70"} onClick={() => sitePack && setStep(3)}>
              Step 3
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
