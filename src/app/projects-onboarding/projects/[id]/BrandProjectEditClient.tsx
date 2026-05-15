"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, Plus, Settings2, Trash2 } from "lucide-react";

import { BrandProjectDashboard, type BrandProjectRow } from "@/app/projects-onboarding/_components/BrandProjectDashboard";
import { CompetitorAngleMixView } from "@/app/projects-onboarding/_components/CompetitorAngleMixView";
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
import type { BrandMarketingAngle } from "@/lib/onboardingBrandClaude";
import { toast } from "sonner";

type Tab = "dashboard" | "angles" | "competitors" | "ads" | "settings";

function newAngle(): BrandMarketingAngle {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `angle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, label: "", rationale: "" };
}

function siteHostname(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

function brandInitial(title: string, siteName: string | null): string {
  const s = (siteName?.trim() || title.trim() || "B")[0];
  return (s ?? "B").toUpperCase();
}

export default function BrandProjectEditClient({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [competitorMix, setCompetitorMix] = useState<{ index: number; name: string } | null>(null);
  const [row, setRow] = useState<BrandProjectRow | null>(null);
  const [title, setTitle] = useState("");
  const [angles, setAngles] = useState<BrandMarketingAngle[]>([]);
  const [competitors, setCompetitors] = useState<unknown[]>([]);
  const [newCompName, setNewCompName] = useState("");
  const [newCompDomain, setNewCompDomain] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/brand/projects/${encodeURIComponent(projectId)}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string } & Partial<BrandProjectRow>;
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const data = json as BrandProjectRow;
      setRow(data);
      setTitle(data.title ?? "");
      setAngles(Array.isArray(data.marketing_angles) ? data.marketing_angles : []);
      setCompetitors(Array.isArray(data.competitors) ? data.competitors : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load project.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    const cleanAngles = angles
      .map((a) => ({
        id: a.id,
        label: a.label.trim(),
        rationale: a.rationale?.trim() || undefined,
        evidence: a.evidence?.trim() || undefined,
      }))
      .filter((a) => a.label.length > 0);

    setSaving(true);
    try {
      const res = await fetch(`/api/onboarding/brand/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          marketing_angles: cleanAngles,
          competitors,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      toast.success("Saved.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [angles, competitors, load, projectId, title]);

  const addCompetitorStub = useCallback(() => {
    const name = newCompName.trim();
    if (!name) {
      toast.error("Enter a competitor name.");
      return;
    }
    const domain = newCompDomain.trim() || null;
    setCompetitors((prev) => [
      ...prev,
      {
        input_name: name,
        input_domain: domain,
        trendtrack_lookup: null,
        trendtrack_ads: [],
        website_text_sample: "",
        claude: {
          summary: "Not analyzed yet — use Refresh on the dashboard or re-run onboarding.",
          ad_patterns: [],
          angles_they_stress: [],
          gaps_you_can_attack: [],
        },
      },
    ]);
    setNewCompName("");
    setNewCompDomain("");
    toast.success("Competitor added — save in Settings, then refresh on Dashboard.");
  }, [newCompDomain, newCompName]);

  if (loading || !row) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0a0a0b] text-white/60">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  const navTabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "angles", label: "Winning angles" },
    { id: "competitors", label: "Competitors" },
    { id: "ads", label: "Ad samples" },
    { id: "settings", label: "Settings" },
  ];

  const displayName = row.site_name?.trim() || row.title;
  const domain = siteHostname(row.site_url);

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0b] text-white antialiased">
      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#0a0a0b]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/projects-onboarding/projects"
              className="mr-1 hidden text-xs text-white/40 hover:text-white/70 sm:inline"
            >
              ← Projects
            </Link>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black text-base font-bold text-white">
              {brandInitial(row.title, row.site_name)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-white sm:text-lg">{displayName}</h1>
              <p className="truncate text-xs text-white/40">{domain}</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"
            aria-label="More options"
          >
            <MoreHorizontal className="size-5" />
          </button>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
          {navTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setCompetitorMix(null);
                setTab(t.id);
              }}
              className={cn(
                "relative shrink-0 px-3 pb-3 pt-1 text-sm font-medium transition",
                tab === t.id ? "text-white" : "text-white/45 hover:text-white/75",
              )}
            >
              {t.label}
              {tab === t.id ? (
                <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-white" />
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {competitorMix ? (
          <CompetitorAngleMixView
            projectId={projectId}
            competitorIndex={competitorMix.index}
            competitorName={competitorMix.name}
            onBack={() => setCompetitorMix(null)}
          />
        ) : tab === "dashboard" ? (
          <BrandProjectDashboard
            project={row}
            onProjectUpdated={() => void load()}
            onCompetitorClick={(index, name) => setCompetitorMix({ index, name })}
          />
        ) : tab === "angles" ? (
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121212] p-6">
            <h2 className="text-lg font-semibold text-white">Winning angles</h2>
            <p className="mt-1 text-sm text-white/45">
              Angles from your site analysis. Edit labels and rationale in Settings.
            </p>
            <ul className="mt-6 space-y-3">
              {(row.marketing_angles ?? []).length === 0 ? (
                <li className="text-sm text-white/45">No angles yet.</li>
              ) : (
                row.marketing_angles.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3"
                  >
                    <p className="font-medium text-white">{a.label}</p>
                    {a.rationale ? (
                      <p className="mt-1 text-sm leading-relaxed text-white/55">{a.rationale}</p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
            <Button
              type="button"
              variant="secondary"
              className="mt-6 border-white/15 bg-white/10 text-white hover:bg-white/15"
              onClick={() => setTab("settings")}
            >
              Edit in Settings
            </Button>
          </div>
        ) : tab === "competitors" ? (
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121212] p-6">
            <h2 className="text-lg font-semibold text-white">Competitors</h2>
            <p className="mt-1 text-sm text-white/45">
              Tracked brands from onboarding. Refresh ads from the Dashboard sidebar.
            </p>
            <ul className="mt-6 space-y-3">
              {(row.competitors ?? []).length === 0 ? (
                <li className="text-sm text-white/45">No competitors stored.</li>
              ) : (
                (row.competitors as unknown[]).map((c, i) => {
                  const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
                  const name = typeof o.input_name === "string" ? o.input_name : `Competitor ${i + 1}`;
                  const ads = Array.isArray(o.trendtrack_ads) ? o.trendtrack_ads.length : 0;
                  return (
                    <li key={`${name}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setCompetitorMix({ index: i, name })}
                        className="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3 text-left transition hover:border-white/15 hover:bg-black/35"
                      >
                        <span className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-sm font-bold">
                          {(name[0] ?? "?").toUpperCase()}
                        </span>
                        <div>
                          <p className="font-medium text-white">{name}</p>
                          <p className="text-xs text-white/40">
                            {ads} ad{ads !== 1 ? "s" : ""} collected
                            {typeof o.input_domain === "string" ? ` · ${o.input_domain}` : ""}
                          </p>
                          <p className="mt-1 text-[10px] font-medium text-violet-300/80">
                            View market angle mix →
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            <Button
              type="button"
              variant="secondary"
              className="mt-6 border-white/15 bg-white/10 text-white hover:bg-white/15"
              onClick={() => setTab("settings")}
            >
              Manage in Settings
            </Button>
          </div>
        ) : tab === "ads" ? (
          <BrandProjectDashboard project={row} onProjectUpdated={() => void load()} focus="ads" />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            <Card className="border-white/10 bg-[#121212] shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="size-4 text-white/50" />
                  Project settings
                </CardTitle>
                <CardDescription className="text-white/55">Title, angles, and competitor list.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border-white/15 bg-black/35 text-white"
                  />
                </div>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="bg-violet-400 text-black hover:bg-violet-300"
                >
                  {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Save changes
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-[#121212] shadow-none">
              <CardHeader>
                <CardTitle>Marketing angles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {angles.map((a, idx) => (
                  <div key={a.id} className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs">Label</Label>
                          <Input
                            value={a.label}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAngles((prev) => prev.map((x, i) => (i === idx ? { ...x, label: v } : x)));
                            }}
                            className="border-white/15 bg-black/35 text-white"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Rationale</Label>
                          <Input
                            value={a.rationale ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAngles((prev) => prev.map((x, i) => (i === idx ? { ...x, rationale: v } : x)));
                            }}
                            className="border-white/15 bg-black/35 text-white"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-white/45 hover:text-red-300"
                        onClick={() => setAngles((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove angle"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                  onClick={() => setAngles((prev) => [...prev, newAngle()])}
                >
                  <Plus className="mr-2 size-4" />
                  Add angle
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-[#121212] shadow-none">
              <CardHeader>
                <CardTitle>Competitors</CardTitle>
                <CardDescription className="text-white/55">
                  Manual rows only here — use Dashboard → Refresh for TrendTrack enrichment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {competitors.length === 0 ? (
                  <p className="text-sm text-white/45">No competitors stored.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-white/75">
                    {competitors.map((c, i) => {
                      const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
                      const name = typeof o.input_name === "string" ? o.input_name : `Competitor ${i + 1}`;
                      return (
                        <li key={`${name}-${i}`} className="rounded-lg border border-white/10 bg-black/25 p-3">
                          <div className="font-medium text-white">{name}</div>
                          {typeof o.input_domain === "string" ? (
                            <p className="text-xs text-white/40">{o.input_domain}</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">New competitor name</Label>
                    <Input
                      value={newCompName}
                      onChange={(e) => setNewCompName(e.target.value)}
                      className="border-white/15 bg-black/35 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Domain (optional)</Label>
                    <Input
                      value={newCompDomain}
                      onChange={(e) => setNewCompDomain(e.target.value)}
                      className="border-white/15 bg-black/35 text-white"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="border-white/15 bg-white/10 text-white"
                  onClick={addCompetitorStub}
                >
                  Add competitor row
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
