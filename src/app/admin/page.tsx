"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Search,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ledgerTicksToDisplayCredits } from "@/lib/creditLedgerTicks";

type Tab = "generations" | "runs";

type GenerationRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  kind: string;
  status: string;
  label: string;
  external_task_id: string;
  provider: string;
  model?: string;
  app_endpoint?: string;
  /** Product / page URL for Link to Ad (and other flows that set `input_urls`). */
  input_urls?: string[] | null;
  result_urls: string[] | null;
  error_message: string | null;
  credits_charged: number;
  uses_personal_api: boolean;
};

type RunRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  store_url: string;
  title: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  video_url: string | null;
  generated_image_urls: string[] | null;
  selected_image_url: string | null;
  packshot_urls: string[] | null;
};

type Stats = {
  totalGenerations: number;
  totalRuns: number;
  totalUsers: number;
  totalCreditsSpent: number;
  statusBreakdown: { ready: number; failed: number; processing: number };
  kindBreakdown: Record<string, number>;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function statusColor(status: string): string {
  if (status === "ready") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (status === "failed") return "bg-red-500/20 text-red-300 border-red-500/30";
  return "bg-amber-500/20 text-amber-300 border-amber-500/30";
}

function kindLabel(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\bstudio\b/i, "").trim() || kind;
}

function productLinkLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return "—";
  try {
    return new URL(t).hostname;
  } catch {
    return t.length > 42 ? `${t.slice(0, 40)}…` : t;
  }
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function durationForRow(row: GenerationRow): string {
  const startIso = row.started_at || row.created_at;
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return "—";
  const endIso = row.completed_at || (row.status === "processing" ? new Date().toISOString() : row.updated_at);
  const end = Date.parse(endIso);
  if (!Number.isFinite(end)) return "—";
  return formatDurationMs(end - start);
}

function MediaPreview({ urls }: { urls: string[] | null }) {
  if (!urls || urls.length === 0) return <span className="text-white/25">—</span>;
  const first = urls[0];
  const isVideo = /\.(mp4|webm|mov)/i.test(first) || first.includes("video");
  return (
    <div className="flex items-center gap-1.5">
      {isVideo ? (
        <Video className="h-4 w-4 shrink-0 text-violet-300" />
      ) : (
        <ImageIcon className="h-4 w-4 shrink-0 text-violet-300" />
      )}
      <a
        href={first}
        target="_blank"
        rel="noreferrer"
        className="max-w-[200px] truncate text-xs text-violet-300 underline underline-offset-2 hover:text-violet-200"
      >
        {urls.length === 1 ? "View" : `${urls.length} files`}
      </a>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accent)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
          <p className="text-xs text-white/50">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("generations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  // Generations state
  const [genRows, setGenRows] = useState<GenerationRow[]>([]);
  const [genEmailMap, setGenEmailMap] = useState<Record<string, string>>({});
  const [genTotal, setGenTotal] = useState(0);
  const [genPage, setGenPage] = useState(1);
  const [genKind, setGenKind] = useState("");
  const [genStatus, setGenStatus] = useState("");
  const [genSearch, setGenSearch] = useState("");
  const [genSearchInput, setGenSearchInput] = useState("");

  // Runs state
  const [runRows, setRunRows] = useState<RunRow[]>([]);
  const [runEmailMap, setRunEmailMap] = useState<Record<string, string>>({});
  const [runTotal, setRunTotal] = useState(0);
  const [runPage, setRunPage] = useState(1);
  const [runSearch, setRunSearch] = useState("");
  const [runSearchInput, setRunSearchInput] = useState("");

  // Expanded row (for prompt/details)
  const [expandedGenId, setExpandedGenId] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const perPage = 50;

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setStats(d as Stats))
      .catch((e) => setError(e.message));
  }, []);

  const fetchGenerations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(genPage), per_page: String(perPage) });
      if (genKind) params.set("kind", genKind);
      if (genStatus) params.set("status", genStatus);
      if (genSearch) params.set("q", genSearch);
      const r = await fetch(`/api/admin/generations?${params}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const d = await r.json();
      setGenRows(d.rows);
      setGenEmailMap(d.emailMap);
      setGenTotal(d.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [genPage, genKind, genStatus, genSearch]);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(runPage), per_page: String(perPage) });
      if (runSearch) params.set("q", runSearch);
      const r = await fetch(`/api/admin/runs?${params}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const d = await r.json();
      setRunRows(d.rows);
      setRunEmailMap(d.emailMap);
      setRunTotal(d.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [runPage, runSearch]);

  useEffect(() => {
    if (tab === "generations") void fetchGenerations();
    else void fetchRuns();
  }, [tab, fetchGenerations, fetchRuns]);

  const genTotalPages = Math.max(1, Math.ceil(genTotal / perPage));
  const runTotalPages = Math.max(1, Math.ceil(runTotal / perPage));

  const uniqueKinds = useMemo(() => {
    if (!stats?.kindBreakdown) return [];
    return Object.keys(stats.kindBreakdown).sort();
  }, [stats]);

  if (error === "Forbidden") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="text-center">
          <p className="text-lg font-semibold text-red-400">Access Denied</p>
          <p className="mt-2 text-sm text-white/50">Your account is not authorized for admin access.</p>
          <Link href="/link-to-ad" className="mt-4 inline-block text-sm text-violet-400 underline underline-offset-2">
            Back to app
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050507] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/link-to-ad"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Admin Dashboard</h1>
              <p className="text-xs text-white/40">All user generations & projects</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setTab("generations"); setGenPage(1); }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tab === "generations" ? "bg-violet-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10",
              )}
            >
              Generations
            </button>
            <button
              type="button"
              onClick={() => { setTab("runs"); setRunPage(1); }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tab === "runs" ? "bg-violet-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10",
              )}
            >
              Link to Ad Runs
            </button>
          </div>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Generations" value={stats.totalGenerations} icon={Activity} accent="bg-violet-500/20 text-violet-300" />
            <StatCard label="Total Users" value={stats.totalUsers} icon={Users} accent="bg-blue-500/20 text-blue-300" />
            <StatCard label="Credits Spent" value={stats.totalCreditsSpent} icon={Zap} accent="bg-amber-500/20 text-amber-300" />
            <StatCard label="Link to Ad Runs" value={stats.totalRuns} icon={ExternalLink} accent="bg-emerald-500/20 text-emerald-300" />
          </div>
        )}

        {/* Kind breakdown chips */}
        {stats?.kindBreakdown && tab === "generations" && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(stats.kindBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setGenKind(genKind === k ? "" : k); setGenPage(1); }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-medium transition",
                    genKind === k
                      ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                      : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/70",
                  )}
                >
                  {kindLabel(k)} <span className="ml-1 tabular-nums text-white/30">{v}</span>
                </button>
              ))}
          </div>
        )}

        {/* Filters bar */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder={tab === "generations" ? "Search by label or task ID…" : "Search by URL, title, or prompt…"}
              value={tab === "generations" ? genSearchInput : runSearchInput}
              onChange={(e) => tab === "generations" ? setGenSearchInput(e.target.value) : setRunSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (tab === "generations") { setGenSearch(genSearchInput); setGenPage(1); }
                  else { setRunSearch(runSearchInput); setRunPage(1); }
                }
              }}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-10 pr-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-violet-400/40"
            />
          </div>
          {tab === "generations" && (
            <select
              value={genStatus}
              onChange={(e) => { setGenStatus(e.target.value); setGenPage(1); }}
              className="rounded-lg border border-white/10 bg-[#0b0912] px-3 py-2 text-xs text-white/70 outline-none"
            >
              <option value="">All statuses</option>
              <option value="ready">Ready</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
          )}
          {tab === "generations" && uniqueKinds.length > 0 && (
            <select
              value={genKind}
              onChange={(e) => { setGenKind(e.target.value); setGenPage(1); }}
              className="rounded-lg border border-white/10 bg-[#0b0912] px-3 py-2 text-xs text-white/70 outline-none"
            >
              <option value="">All types</option>
              {uniqueKinds.map((k) => (
                <option key={k} value={k}>{kindLabel(k)}</option>
              ))}
            </select>
          )}
        </div>

        {/* Table */}
        {loading && genRows.length === 0 && runRows.length === 0 ? (
          <div className="mt-12 flex items-center justify-center gap-2 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : tab === "generations" ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40">
                  <th className="px-3 py-2.5 font-semibold">User</th>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Link to Ad URL</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Credits</th>
                  <th className="px-3 py-2.5 font-semibold">Model</th>
                  <th className="px-3 py-2.5 font-semibold">App API</th>
                  <th className="px-3 py-2.5 font-semibold">Provider</th>
                  <th className="px-3 py-2.5 font-semibold">Label</th>
                  <th className="px-3 py-2.5 font-semibold">Media</th>
                  <th className="px-3 py-2.5 font-semibold">Duration</th>
                  <th className="px-3 py-2.5 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {genRows.map((row) => (
                  <>
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-white/5 transition hover:bg-white/[0.02] cursor-pointer",
                        expandedGenId === row.id && "bg-white/[0.03]",
                      )}
                      onClick={() => setExpandedGenId(expandedGenId === row.id ? null : row.id)}
                    >
                      <td className="px-3 py-2.5">
                        <span className="max-w-[140px] truncate block text-white/70" title={genEmailMap[row.user_id] ?? row.user_id}>
                          {genEmailMap[row.user_id]?.split("@")[0] ?? row.user_id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/60">
                          {kindLabel(row.kind)}
                        </span>
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5">
                        {row.input_urls?.[0]?.trim() ? (
                          <a
                            href={row.input_urls[0].trim()}
                            target="_blank"
                            rel="noreferrer"
                            className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
                            title={row.input_urls[0].trim()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {productLinkLabel(row.input_urls[0])}
                          </a>
                        ) : (
                          <span className="text-white/25">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", statusColor(row.status))}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-white/60">
                        {row.credits_charged > 0
                          ? ledgerTicksToDisplayCredits(row.credits_charged)
                          : row.uses_personal_api
                            ? "API key"
                            : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="max-w-[180px] truncate block text-white/55" title={row.model || ""}>
                          {row.model?.trim() ? row.model : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="max-w-[180px] truncate block font-mono text-[11px] text-white/45" title={row.app_endpoint || ""}>
                          {row.app_endpoint?.trim() ? row.app_endpoint : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-white/50">{row.provider}</td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-white/60" title={row.label}>
                        {row.label || "—"}
                      </td>
                      <td className="px-3 py-2.5"><MediaPreview urls={row.result_urls} /></td>
                      <td className="px-3 py-2.5 tabular-nums text-white/50 whitespace-nowrap">{durationForRow(row)}</td>
                      <td className="px-3 py-2.5 text-white/40 whitespace-nowrap">{relativeTime(row.created_at)}</td>
                    </tr>
                    {expandedGenId === row.id && (
                      <tr key={`${row.id}-expand`} className="border-b border-white/5">
                        <td colSpan={12} className="bg-white/[0.02] px-4 py-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Full Label / Prompt</p>
                              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-white/70">{row.label || "No label"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Details</p>
                              <div className="mt-1 space-y-1 text-xs text-white/60">
                                <p><span className="text-white/40">ID:</span> {row.id}</p>
                                <p><span className="text-white/40">Task ID:</span> {row.external_task_id}</p>
                                <p><span className="text-white/40">User:</span> {genEmailMap[row.user_id] ?? row.user_id}</p>
                                {row.input_urls?.[0]?.trim() ? (
                                  <p>
                                    <span className="text-white/40">Link to Ad URL:</span>{" "}
                                    <a
                                      href={row.input_urls[0].trim()}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="break-all text-violet-300 underline underline-offset-2 hover:text-violet-200"
                                    >
                                      {row.input_urls[0].trim()}
                                    </a>
                                  </p>
                                ) : null}
                                <p><span className="text-white/40">Created:</span> {new Date(row.created_at).toLocaleString()}</p>
                                <p><span className="text-white/40">Model:</span> {row.model?.trim() ? row.model : "—"}</p>
                                <p><span className="text-white/40">App API:</span> <span className="font-mono">{row.app_endpoint?.trim() ? row.app_endpoint : "—"}</span></p>
                                <p><span className="text-white/40">Duration:</span> {durationForRow(row)}</p>
                                {row.error_message && (
                                  <p className="text-red-300/80"><span className="text-white/40">Error:</span> {row.error_message}</p>
                                )}
                              </div>
                            </div>
                            {row.result_urls && row.result_urls.length > 0 && (
                              <div className="sm:col-span-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Result URLs</p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {row.result_urls.map((url, i) => {
                                    const isVid = /\.(mp4|webm|mov)/i.test(url);
                                    return (
                                      <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="group relative h-20 w-20 overflow-hidden rounded-lg border border-white/10 bg-black"
                                      >
                                        {isVid ? (
                                          <video src={url} className="h-full w-full object-cover" muted preload="metadata" />
                                        ) : (
                                          /* eslint-disable-next-line @next/next/no-img-element */
                                          <img src={url} alt="" className="h-full w-full object-cover" />
                                        )}
                                        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                                          <ExternalLink className="h-4 w-4 text-white" />
                                        </span>
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            {genRows.length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-white/30">No generations found</p>
            )}
            {/* Pagination */}
            <div className="mt-3 flex items-center justify-between px-1">
              <p className="text-[11px] text-white/40">{genTotal} total</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={genPage <= 1}
                  onClick={() => setGenPage((p) => p - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs tabular-nums text-white/50">{genPage} / {genTotalPages}</span>
                <button
                  type="button"
                  disabled={genPage >= genTotalPages}
                  onClick={() => setGenPage((p) => p + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40">
                  <th className="px-3 py-2.5 font-semibold">User</th>
                  <th className="px-3 py-2.5 font-semibold">Store URL</th>
                  <th className="px-3 py-2.5 font-semibold">Title</th>
                  <th className="px-3 py-2.5 font-semibold">Images</th>
                  <th className="px-3 py-2.5 font-semibold">Video</th>
                  <th className="px-3 py-2.5 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {runRows.map((row) => (
                  <>
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-white/5 transition hover:bg-white/[0.02] cursor-pointer",
                        expandedRunId === row.id && "bg-white/[0.03]",
                      )}
                      onClick={() => setExpandedRunId(expandedRunId === row.id ? null : row.id)}
                    >
                      <td className="px-3 py-2.5">
                        <span className="max-w-[140px] truncate block text-white/70" title={runEmailMap[row.user_id] ?? row.user_id}>
                          {runEmailMap[row.user_id]?.split("@")[0] ?? row.user_id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5">
                        {row.store_url ? (
                          <a href={row.store_url} target="_blank" rel="noreferrer" className="text-violet-300 underline underline-offset-2 hover:text-violet-200">
                            {new URL(row.store_url).hostname}
                          </a>
                        ) : "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-white/60">{row.title ?? "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-white/50">
                        {(row.generated_image_urls?.length ?? 0) + (row.packshot_urls?.length ?? 0)}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.video_url ? (
                          <a href={row.video_url} target="_blank" rel="noreferrer" className="text-violet-300 underline underline-offset-2 hover:text-violet-200 text-[11px]">
                            View video
                          </a>
                        ) : <span className="text-white/25">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-white/40 whitespace-nowrap">{relativeTime(row.updated_at)}</td>
                    </tr>
                    {expandedRunId === row.id && (
                      <tr key={`${row.id}-expand`} className="border-b border-white/5">
                        <td colSpan={6} className="bg-white/[0.02] px-4 py-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Image Prompt</p>
                              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-white/70">{row.image_prompt || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Video Prompt</p>
                              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-white/70">{row.video_prompt || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Details</p>
                              <div className="mt-1 space-y-1 text-xs text-white/60">
                                <p><span className="text-white/40">ID:</span> {row.id}</p>
                                <p><span className="text-white/40">User:</span> {runEmailMap[row.user_id] ?? row.user_id}</p>
                                <p><span className="text-white/40">Store:</span> {row.store_url}</p>
                                <p><span className="text-white/40">Created:</span> {new Date(row.created_at).toLocaleString()}</p>
                              </div>
                            </div>
                            {(row.generated_image_urls?.length ?? 0) > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Generated Images</p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {row.generated_image_urls?.map((url, i) => (
                                    <a key={i} href={url} target="_blank" rel="noreferrer" className="group relative h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-black">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={url} alt="" className="h-full w-full object-cover" />
                                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                                        <ExternalLink className="h-3 w-3 text-white" />
                                      </span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            {runRows.length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-white/30">No runs found</p>
            )}
            <div className="mt-3 flex items-center justify-between px-1">
              <p className="text-[11px] text-white/40">{runTotal} total</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={runPage <= 1}
                  onClick={() => setRunPage((p) => p - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs tabular-nums text-white/50">{runPage} / {runTotalPages}</span>
                <button
                  type="button"
                  disabled={runPage >= runTotalPages}
                  onClick={() => setRunPage((p) => p + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
