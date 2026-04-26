"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Gift,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Search,
  Trash2,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ledgerTicksToDisplayCredits } from "@/lib/creditLedgerTicks";

type Tab = "generations" | "runs" | "credits" | "onboarding" | "feedback" | "templates";

type OnboardingAdminRow = {
  user_id: string;
  email: string;
  work_type: string | null;
  referral_source: string | null;
  completed_at: string;
  created_at: string;
  plan_id: string | null;
  sub_status: string | null;
  is_subscriber: boolean;
  trial_active: boolean;
  /** Display credits from ledger at load time (not historical). */
  credit_balance: number | null;
};

type CreditRedeemTokenRow = {
  id: string;
  secret: string;
  label: string | null;
  amount: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  created_at: string;
  active: boolean;
  grant_type: "credits" | "plan";
  plan_id: string | null;
  plan_billing: string | null;
  plan_duration_days: number | null;
  bundle_plan_id: string | null;
  bundle_plan_billing: string | null;
  bundle_plan_duration_days: number | null;
};

type CreditRedeemLogRow = {
  id: string;
  user_id: string;
  email: string;
  credits: number;
  redeemed_at: string;
  token_id: string;
  token_label: string | null;
  token_secret_prefix: string | null;
  token_offer_amount: number | null;
  grant_type: "credits" | "plan";
  plan_id: string | null;
  plan_billing: string | null;
  plan_expires_at: string | null;
};

type ActiveCompPlanRow = {
  id: string;
  user_id: string;
  email: string;
  plan_id: string;
  billing: "monthly" | "yearly";
  source: string;
  granted_at: string;
  expires_at: string;
  token_id: string | null;
  token_label: string | null;
};

type CreditRedeemStats = {
  tokensTotal: number;
  tokensActive: number;
  tokensExhausted: number;
  redemptionsTotal: number;
  creditsIssuedViaLinks: number;
  creditsOnLogPage: number;
  plansActive: number;
};

type GrantTypeUi = "credits" | "plan";
const PLAN_OPTIONS = [
  { id: "starter", label: "Starter" },
  { id: "growth", label: "Growth" },
  { id: "pro", label: "Pro" },
  { id: "scale", label: "Scale" },
] as const;

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
  /** Ledger balance (display credits) shortly after register; null if column missing or not set. */
  credit_balance_after?: number | null;
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

type WorkflowTemplateAdminRow = {
  id: string;
  created_by: string | null;
  created_by_name: string | null;
  name: string;
  blurb: string | null;
  created_at: string;
  updated_at: string;
};

type Stats = {
  totalGenerations: number;
  totalRuns: number;
  totalUsers: number;
  totalCreditsSpent: number;
  statusBreakdown: { ready: number; failed: number; processing: number };
  kindBreakdown: Record<string, number>;
};

type FeedbackRow = {
  id: string;
  user_id: string;
  email: string | null;
  category: "feedback" | "feature" | "bug" | string;
  message: string;
  page_path: string | null;
  status: string | null;
  created_at: string;
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
  if (!t) return "-";
  try {
    return new URL(t).hostname;
  } catch {
    return t.length > 42 ? `${t.slice(0, 40)}…` : t;
  }
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

function adminGenerationModelLabel(row: GenerationRow): string {
  const m = row.model?.trim();
  if (m) return m;
  const k = row.kind?.toLowerCase() ?? "";
  if (k === "motion_control") return "motion control";
  if (k.includes("upscale")) return "upscale";
  if (k.includes("video")) return "video (model not recorded)";
  if (k.includes("image") || k === "avatar") return "image (model not recorded)";
  return "-";
}

function formatCreditBalanceSnap(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "-";
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function durationForRow(row: GenerationRow): string {
  const startIso = row.started_at || row.created_at;
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return "-";
  const endIso = row.completed_at || (row.status === "processing" ? new Date().toISOString() : row.updated_at);
  const end = Date.parse(endIso);
  if (!Number.isFinite(end)) return "-";
  return formatDurationMs(end - start);
}

function MediaPreview({ urls }: { urls: string[] | null }) {
  if (!urls || urls.length === 0) return <span className="text-white/25">-</span>;
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

  const [onboardRows, setOnboardRows] = useState<OnboardingAdminRow[]>([]);
  const [onboardTotal, setOnboardTotal] = useState(0);
  const [onboardPage, setOnboardPage] = useState(1);
  const [onboardSearch, setOnboardSearch] = useState("");
  const [onboardSearchInput, setOnboardSearchInput] = useState("");
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardWarning, setOnboardWarning] = useState<string | null>(null);
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [feedbackSearch, setFeedbackSearch] = useState("");
  const [feedbackSearchInput, setFeedbackSearchInput] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [templateRows, setTemplateRows] = useState<WorkflowTemplateAdminRow[]>([]);
  const [templateEmailMap, setTemplateEmailMap] = useState<Record<string, string>>({});
  const [templateTotal, setTemplateTotal] = useState(0);
  const [templatePage, setTemplatePage] = useState(1);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateSearchInput, setTemplateSearchInput] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Expanded row (for prompt/details)
  const [expandedGenId, setExpandedGenId] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Credit redeem audit
  const [creditTokens, setCreditTokens] = useState<CreditRedeemTokenRow[]>([]);
  const [creditLogs, setCreditLogs] = useState<CreditRedeemLogRow[]>([]);
  const [creditStats, setCreditStats] = useState<CreditRedeemStats | null>(null);
  const [activeCompPlans, setActiveCompPlans] = useState<ActiveCompPlanRow[]>([]);
  const [creditLogTotal, setCreditLogTotal] = useState(0);
  const [creditLogPage, setCreditLogPage] = useState(1);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [partnerPlansLoading, setPartnerPlansLoading] = useState(false);
  const [revokePlanId, setRevokePlanId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create token form
  const [createLabel, setCreateLabel] = useState("");
  const [createAmount, setCreateAmount] = useState("100");
  const [createMaxUses, setCreateMaxUses] = useState("1");
  const [createExpiry, setCreateExpiry] = useState("30");
  const [createGrantType, setCreateGrantType] = useState<GrantTypeUi>("credits");
  const [createPlanId, setCreatePlanId] = useState<string>("growth");
  const [createPlanBilling, setCreatePlanBilling] = useState<"monthly" | "yearly">("monthly");
  const [createPlanDuration, setCreatePlanDuration] = useState("30");
  // Partner-bundle (credits link that ALSO grants comp plan access).
  const [createBundleEnabled, setCreateBundleEnabled] = useState(true);
  const [createBundlePlanId, setCreateBundlePlanId] = useState<string>("scale");
  const [createBundleBilling, setCreateBundleBilling] = useState<"monthly" | "yearly">("monthly");
  const [createBundleDuration, setCreateBundleDuration] = useState("30");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);

  const perPage = 50;
  const creditLogPerPage = 50;

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

  const fetchOnboarding = useCallback(async () => {
    setOnboardLoading(true);
    setOnboardError(null);
    setOnboardWarning(null);
    try {
      const params = new URLSearchParams({ page: String(onboardPage), per_page: String(perPage) });
      if (onboardSearch) params.set("q", onboardSearch);
      const r = await fetch(`/api/admin/onboarding?${params}`);
      const d = (await r.json()) as {
        rows?: OnboardingAdminRow[];
        total?: number;
        warning?: string;
        error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setOnboardRows(d.rows ?? []);
      setOnboardTotal(d.total ?? 0);
      if (d.warning) setOnboardWarning(d.warning);
    } catch (e) {
      setOnboardError(e instanceof Error ? e.message : "Failed to load onboarding");
    } finally {
      setOnboardLoading(false);
    }
  }, [onboardPage, onboardSearch]);

  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const params = new URLSearchParams({ page: String(feedbackPage), per_page: String(perPage) });
      if (feedbackCategory) params.set("category", feedbackCategory);
      if (feedbackSearch) params.set("q", feedbackSearch);
      const r = await fetch(`/api/admin/feedback?${params}`);
      const d = (await r.json()) as { rows?: FeedbackRow[]; total?: number; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setFeedbackRows(d.rows ?? []);
      setFeedbackTotal(d.total ?? 0);
    } catch (e) {
      setFeedbackError(e instanceof Error ? e.message : "Failed to load feedback");
    } finally {
      setFeedbackLoading(false);
    }
  }, [feedbackCategory, feedbackPage, feedbackSearch, perPage]);

  const fetchWorkflowTemplates = useCallback(async () => {
    setTemplateLoading(true);
    setTemplateError(null);
    try {
      const params = new URLSearchParams({ page: String(templatePage), per_page: String(perPage) });
      if (templateSearch) params.set("q", templateSearch);
      const r = await fetch(`/api/admin/workflow-templates?${params}`);
      const d = (await r.json()) as {
        rows?: WorkflowTemplateAdminRow[];
        emailMap?: Record<string, string>;
        total?: number;
        error?: string;
      };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setTemplateRows(d.rows ?? []);
      setTemplateEmailMap(d.emailMap ?? {});
      setTemplateTotal(d.total ?? 0);
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setTemplateLoading(false);
    }
  }, [templatePage, templateSearch, perPage]);

  const fetchCreditRedeems = useCallback(async () => {
    setCreditLoading(true);
    setCreditError(null);
    try {
      const params = new URLSearchParams({
        log_page: String(creditLogPage),
        log_per_page: String(creditLogPerPage),
      });
      const r = await fetch(`/api/admin/credit-redeems?${params}`);
      const d = (await r.json()) as {
        error?: string;
        tokens?: CreditRedeemTokenRow[];
        logs?: CreditRedeemLogRow[];
        activePlans?: ActiveCompPlanRow[];
        stats?: CreditRedeemStats;
        logTotal?: number;
      };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setCreditTokens(d.tokens ?? []);
      setCreditLogs(d.logs ?? []);
      setActiveCompPlans(d.activePlans ?? []);
      setCreditStats(d.stats ?? null);
      setCreditLogTotal(d.logTotal ?? 0);
    } catch (e) {
      setCreditError(e instanceof Error ? e.message : "Failed to load credit redeems");
    } finally {
      setCreditLoading(false);
    }
  }, [creditLogPage, creditLogPerPage]);

  const fetchActivePartnerPlans = useCallback(async () => {
    setPartnerPlansLoading(true);
    try {
      const r = await fetch("/api/admin/credit-redeems?active_plans_only=1");
      const d = (await r.json()) as { error?: string; activePlans?: ActiveCompPlanRow[] };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setActiveCompPlans(d.activePlans ?? []);
    } catch {
      // Silent in non-credits tabs: this list is only for optional quick actions.
    } finally {
      setPartnerPlansLoading(false);
    }
  }, []);

  const revokeComplimentaryPlan = useCallback(async (planId: string) => {
    setRevokePlanId(planId);
    setCreditError(null);
    try {
      const r = await fetch("/api/admin/credit-redeems", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_plan", planId }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      await fetchCreditRedeems();
      await fetchActivePartnerPlans();
    } catch (e) {
      setCreditError(e instanceof Error ? e.message : "Could not revoke plan");
    } finally {
      setRevokePlanId(null);
    }
  }, [fetchCreditRedeems, fetchActivePartnerPlans]);

  const deleteWorkflowTemplate = useCallback(async (id: string) => {
    setDeletingTemplateId(id);
    setTemplateError(null);
    try {
      const r = await fetch("/api/admin/workflow-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      await fetchWorkflowTemplates();
    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : "Could not delete template");
    } finally {
      setDeletingTemplateId(null);
    }
  }, [fetchWorkflowTemplates]);

  useEffect(() => {
    if (tab === "generations") void fetchGenerations();
    else if (tab === "runs") void fetchRuns();
    else if (tab === "credits") void fetchCreditRedeems();
    else if (tab === "onboarding") void fetchOnboarding();
    else if (tab === "feedback") void fetchFeedback();
    else if (tab === "templates") void fetchWorkflowTemplates();
  }, [tab, fetchGenerations, fetchRuns, fetchCreditRedeems, fetchOnboarding, fetchFeedback, fetchWorkflowTemplates]);

  useEffect(() => {
    if (tab === "generations" && activeCompPlans.length === 0 && !partnerPlansLoading) {
      void fetchActivePartnerPlans();
    }
  }, [tab, activeCompPlans.length, partnerPlansLoading, fetchActivePartnerPlans]);

  const genTotalPages = Math.max(1, Math.ceil(genTotal / perPage));
  const runTotalPages = Math.max(1, Math.ceil(runTotal / perPage));
  const onboardTotalPages = Math.max(1, Math.ceil(onboardTotal / perPage));
  const feedbackTotalPages = Math.max(1, Math.ceil(feedbackTotal / perPage));
  const templateTotalPages = Math.max(1, Math.ceil(templateTotal / perPage));
  const creditLogTotalPages = Math.max(1, Math.ceil(creditLogTotal / creditLogPerPage));

  const copyRedeemLink = useCallback(async (secret: string, rowId: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/redeem?token=${encodeURIComponent(secret)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(rowId);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  const createToken = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    setNewLink(null);
    try {
      const maxUses = createMaxUses === "" ? null : Math.max(1, Math.round(Number(createMaxUses) || 1));
      const expiresInDays = createExpiry === "" ? null : Math.max(1, Math.round(Number(createExpiry) || 30));
      const body: Record<string, unknown> = { grantType: createGrantType };
      if (createLabel.trim()) body.label = createLabel.trim();
      if (maxUses !== null) body.maxUses = maxUses;
      if (expiresInDays !== null) body.expiresInDays = expiresInDays;

      if (createGrantType === "credits") {
        const amount = Math.round(Number(createAmount) || 0);
        if (amount <= 0) throw new Error("Credits amount must be ≥ 1");
        body.amount = amount;
        if (createBundleEnabled) {
          const bundleDuration = Math.round(Number(createBundleDuration) || 0);
          if (bundleDuration <= 0) throw new Error("Bundle plan duration must be ≥ 1 day");
          body.bundlePlanId = createBundlePlanId;
          body.bundlePlanBilling = createBundleBilling;
          body.bundlePlanDurationDays = bundleDuration;
        }
      } else {
        const duration = Math.round(Number(createPlanDuration) || 0);
        if (duration <= 0) throw new Error("Plan duration must be ≥ 1 day");
        body.planId = createPlanId;
        body.planBilling = createPlanBilling;
        body.planDurationDays = duration;
      }

      const r = await fetch("/api/credits/redeem-tokens", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as { token?: { url: string }; error?: string };
      if (!r.ok || !d.token) throw new Error(d.error ?? "Failed to create token");
      setNewLink(d.token.url);
      await navigator.clipboard.writeText(d.token.url).catch(() => {});
      void fetchCreditRedeems();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }, [
    createAmount,
    createLabel,
    createMaxUses,
    createExpiry,
    createGrantType,
    createPlanId,
    createPlanBilling,
    createPlanDuration,
    createBundleEnabled,
    createBundlePlanId,
    createBundleBilling,
    createBundleDuration,
    fetchCreditRedeems,
  ]);

  const uniqueKinds = useMemo(() => {
    if (!stats?.kindBreakdown) return [];
    return Object.keys(stats.kindBreakdown).sort();
  }, [stats]);

  const activePlanByUserId = useMemo(() => {
    const out: Record<string, ActiveCompPlanRow> = {};
    for (const row of activeCompPlans) {
      const existing = out[row.user_id];
      if (!existing) {
        out[row.user_id] = row;
        continue;
      }
      const existingExpiry = Date.parse(existing.expires_at) || 0;
      const nextExpiry = Date.parse(row.expires_at) || 0;
      if (nextExpiry > existingExpiry) out[row.user_id] = row;
    }
    return out;
  }, [activeCompPlans]);

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
              <p className="text-xs text-white/40">
                {tab === "credits"
                  ? "Credit gift links & redemption audit"
                  : tab === "templates"
                    ? "Manage workflow community templates (review and delete)"
                  : tab === "onboarding"
                    ? "Onboarding answers, emails, and subscription status after checkout"
                    : tab === "feedback"
                      ? "User feedback and feature requests from the app"
                    : "All user generations & projects"}
              </p>
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
            <button
              type="button"
              onClick={() => { setTab("onboarding"); setOnboardPage(1); }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tab === "onboarding" ? "bg-violet-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10",
              )}
            >
              Onboarding
            </button>
            <button
              type="button"
              onClick={() => { setTab("credits"); setCreditLogPage(1); }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tab === "credits" ? "bg-violet-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10",
              )}
            >
              Credit links
            </button>
            <button
              type="button"
              onClick={() => { setTab("feedback"); setFeedbackPage(1); }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tab === "feedback" ? "bg-violet-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10",
              )}
            >
              Feedback
            </button>
            <button
              type="button"
              onClick={() => { setTab("templates"); setTemplatePage(1); }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tab === "templates" ? "bg-violet-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10",
              )}
            >
              Templates
            </button>
          </div>
        </div>

        {/* Stats cards */}
        {tab === "credits" && creditStats && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Redeem tokens" value={creditStats.tokensTotal} icon={Gift} accent="bg-fuchsia-500/20 text-fuchsia-300" />
            <StatCard label="Active links" value={creditStats.tokensActive} icon={Zap} accent="bg-emerald-500/20 text-emerald-300" />
            <StatCard label="Active plan grants" value={creditStats.plansActive ?? 0} icon={Users} accent="bg-violet-500/20 text-violet-300" />
            <StatCard
              label="Credits issued (links)"
              value={creditStats.creditsIssuedViaLinks}
              icon={Activity}
              accent="bg-amber-500/20 text-amber-300"
            />
          </div>
        )}
        {tab !== "credits" && tab !== "onboarding" && tab !== "feedback" && stats && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Generations" value={stats.totalGenerations} icon={Activity} accent="bg-violet-500/20 text-violet-300" />
            <StatCard label="Total Users" value={stats.totalUsers} icon={Users} accent="bg-blue-500/20 text-blue-300" />
            <StatCard label="Credits Spent" value={stats.totalCreditsSpent} icon={Zap} accent="bg-amber-500/20 text-amber-300" />
            <StatCard label="Link to Ad Runs" value={stats.totalRuns} icon={ExternalLink} accent="bg-emerald-500/20 text-emerald-300" />
          </div>
        )}

        {/* Kind breakdown chips */}
        {tab === "credits" && creditError && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {creditError}
          </div>
        )}

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
        <div className={cn("mt-4 flex flex-wrap items-center gap-3", (tab === "credits" || tab === "feedback") && "hidden")}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder={
                tab === "generations"
                  ? "Search by label or task ID…"
                  : tab === "templates"
                    ? "Search by template name, blurb, or creator…"
                  : tab === "onboarding"
                    ? "Search work type or referral source…"
                    : "Search by URL, title, or prompt…"
              }
              value={
                tab === "generations"
                  ? genSearchInput
                  : tab === "templates"
                    ? templateSearchInput
                  : tab === "onboarding"
                    ? onboardSearchInput
                    : runSearchInput
              }
              onChange={(e) => {
                if (tab === "generations") setGenSearchInput(e.target.value);
                else if (tab === "templates") setTemplateSearchInput(e.target.value);
                else if (tab === "onboarding") setOnboardSearchInput(e.target.value);
                else setRunSearchInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (tab === "generations") {
                    setGenSearch(genSearchInput);
                    setGenPage(1);
                  } else if (tab === "templates") {
                    setTemplateSearch(templateSearchInput);
                    setTemplatePage(1);
                  } else if (tab === "onboarding") {
                    setOnboardSearch(onboardSearchInput);
                    setOnboardPage(1);
                  } else {
                    setRunSearch(runSearchInput);
                    setRunPage(1);
                  }
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
        {tab === "credits" && creditLoading && creditStats === null && !creditError ? (
          <div className="mt-12 flex items-center justify-center gap-2 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading credit links…
          </div>
        ) : tab === "credits" ? (
          <div className="mt-6 space-y-8">
            {/* ── Create token form ── */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white/90">
                <Gift className="h-4 w-4 text-violet-400" />
                Create a gift link
              </h2>

              {/* Grant type toggle */}
              <div className="mb-4 inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => setCreateGrantType("credits")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-semibold transition",
                    createGrantType === "credits"
                      ? "bg-violet-500 text-white shadow"
                      : "text-white/60 hover:text-white/90",
                  )}
                >
                  Free credits
                </button>
                <button
                  type="button"
                  onClick={() => setCreateGrantType("plan")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-semibold transition",
                    createGrantType === "plan"
                      ? "bg-violet-500 text-white shadow"
                      : "text-white/60 hover:text-white/90",
                  )}
                >
                  Plan access (partner)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Label</label>
                  <input
                    type="text"
                    placeholder={createGrantType === "credits" ? "e.g. Welcome gift" : "e.g. Partner, Jane's free Growth"}
                    value={createLabel}
                    onChange={(e) => setCreateLabel(e.target.value)}
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-violet-500/60"
                  />
                </div>
                {createGrantType === "credits" ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Credits</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="100"
                      value={createAmount}
                      onChange={(e) => setCreateAmount(e.target.value)}
                      className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-violet-500/60"
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Plan</label>
                      <select
                        value={createPlanId}
                        onChange={(e) => setCreatePlanId(e.target.value)}
                        className="rounded-lg border border-white/10 bg-[#0b0912] px-3 py-2 text-xs text-white/90 outline-none focus:border-violet-500/60"
                      >
                        {PLAN_OPTIONS.map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Billing</label>
                      <select
                        value={createPlanBilling}
                        onChange={(e) => setCreatePlanBilling(e.target.value === "yearly" ? "yearly" : "monthly")}
                        className="rounded-lg border border-white/10 bg-[#0b0912] px-3 py-2 text-xs text-white/90 outline-none focus:border-violet-500/60"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                  </>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Max uses</label>
                  <input
                    type="number"
                    min={1}
                    placeholder="1"
                    value={createMaxUses}
                    onChange={(e) => setCreateMaxUses(e.target.value)}
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-violet-500/60"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Link expires (days)</label>
                  <input
                    type="number"
                    min={1}
                    placeholder="30"
                    value={createExpiry}
                    onChange={(e) => setCreateExpiry(e.target.value)}
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-violet-500/60"
                  />
                </div>
                {createGrantType === "plan" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Plan access (days)</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="30"
                      value={createPlanDuration}
                      onChange={(e) => setCreatePlanDuration(e.target.value)}
                      className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-violet-500/60"
                    />
                  </div>
                )}
              </div>

              {createGrantType === "credits" && (
                <div className="mt-4 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] p-3">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={createBundleEnabled}
                      onChange={(e) => setCreateBundleEnabled(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 accent-violet-500"
                    />
                    <span className="flex-1 text-[12px] font-semibold text-violet-100">
                      Bundle partner plan access with this credit link
                      <span className="ml-1 text-[11px] font-normal text-white/55">
                        (recipient also unlocks the chosen plan tier for the configured duration — bypasses the trial)
                      </span>
                    </span>
                  </label>
                  {createBundleEnabled && (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Plan</label>
                        <select
                          value={createBundlePlanId}
                          onChange={(e) => setCreateBundlePlanId(e.target.value)}
                          className="rounded-lg border border-white/10 bg-[#0b0912] px-3 py-2 text-xs text-white/90 outline-none focus:border-violet-500/60"
                        >
                          {PLAN_OPTIONS.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Billing</label>
                        <select
                          value={createBundleBilling}
                          onChange={(e) => setCreateBundleBilling(e.target.value === "yearly" ? "yearly" : "monthly")}
                          className="rounded-lg border border-white/10 bg-[#0b0912] px-3 py-2 text-xs text-white/90 outline-none focus:border-violet-500/60"
                        >
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Plan access (days)</label>
                        <input
                          type="number"
                          min={1}
                          placeholder="30"
                          value={createBundleDuration}
                          onChange={(e) => setCreateBundleDuration(e.target.value)}
                          className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-violet-500/60"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {createGrantType === "plan" && (
                <p className="mt-3 text-[11px] leading-relaxed text-white/45">
                  Plan links grant access to the selected tier without any Stripe charge (for partners without a card).
                  They also credit one month of that tier&apos;s allowance on redemption. Access auto-expires after the chosen number of days — no auto-renewal.
                </p>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void createToken()}
                  disabled={
                    creating ||
                    (createGrantType === "credits" && !createAmount) ||
                    (createGrantType === "plan" && (!createPlanId || !createPlanDuration))
                  }
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
                  {creating ? "Creating…" : "Generate link"}
                </button>
                {newLink && (
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-emerald-300">{newLink}</span>
                    <button
                      type="button"
                      onClick={() => { void navigator.clipboard.writeText(newLink); setCopiedId("new"); window.setTimeout(() => setCopiedId(null), 2000); }}
                      className="shrink-0 text-emerald-400 hover:text-white"
                      title="Copy"
                    >
                      {copiedId === "new" ? <span className="text-[10px]">Copied!</span> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
                {createError && (
                  <span className="text-[11px] text-red-400">{createError}</span>
                )}
              </div>
            </div>

            {/* ── Token list ── */}
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white/80">Gift &amp; promo tokens</h2>
              <button
                type="button"
                onClick={() => void fetchCreditRedeems()}
                disabled={creditLoading}
                className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40">
                    <th className="px-3 py-2.5 font-semibold">Label</th>
                    <th className="px-3 py-2.5 font-semibold">Type</th>
                    <th className="px-3 py-2.5 font-semibold">Grant</th>
                    <th className="px-3 py-2.5 font-semibold">Uses</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Expires</th>
                    <th className="px-3 py-2.5 font-semibold">Created</th>
                    <th className="px-3 py-2.5 font-semibold">Secret (prefix)</th>
                    <th className="px-3 py-2.5 font-semibold">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {creditTokens.map((row) => (
                    <tr key={row.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-white/70" title={row.label ?? ""}>
                        {row.label?.trim() ? row.label : "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.grant_type === "plan" ? (
                          <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                            Plan
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                            Credits
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-white/75">
                        {row.grant_type === "plan" ? (
                          <span>
                            <span className="font-semibold capitalize text-violet-200">{row.plan_id ?? "-"}</span>
                            <span className="ml-1 text-white/40">
                              ({row.plan_billing}, {row.plan_duration_days}d)
                            </span>
                          </span>
                        ) : (
                          <div className="flex flex-col">
                            <span className="font-semibold text-amber-200/90">{row.amount}</span>
                            {row.bundle_plan_id && (
                              <span className="mt-0.5 text-[10px] text-violet-200/80">
                                + <span className="font-semibold capitalize">{row.bundle_plan_id}</span>
                                <span className="ml-1 text-white/40">
                                  ({row.bundle_plan_billing}, {row.bundle_plan_duration_days}d)
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-white/55">
                        {row.used_count}
                        {row.max_uses != null ? ` / ${row.max_uses}` : " / ∞"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            row.active
                              ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-200"
                              : "border-white/15 bg-white/[0.05] text-white/45",
                          )}
                        >
                          {row.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-white/45">
                        {row.expires_at ? new Date(row.expires_at).toLocaleDateString() : "Never"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-white/40">{relativeTime(row.created_at)}</td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-white/35">{row.secret.slice(0, 10)}…</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => void copyRedeemLink(row.secret, row.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-violet-500/35 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-200 transition hover:bg-violet-500/20"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedId === row.id ? "Copied" : "Copy link"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {creditTokens.length === 0 && !creditLoading && (
                <p className="py-8 text-center text-sm text-white/30">No tokens yet, create one via POST /api/credits/redeem-tokens</p>
              )}
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-white/80">Active partner plans</h2>
              <p className="mb-3 text-[11px] leading-relaxed text-white/40">
                Revoke access instantly if needed. This stops plan-gated features right away and does not touch Stripe (these plans are complimentary links).
              </p>
              <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
                <table className="w-full min-w-[920px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40">
                      <th className="px-3 py-2.5 font-semibold">User</th>
                      <th className="px-3 py-2.5 font-semibold">Plan</th>
                      <th className="px-3 py-2.5 font-semibold">Billing</th>
                      <th className="px-3 py-2.5 font-semibold">Granted</th>
                      <th className="px-3 py-2.5 font-semibold">Expires</th>
                      <th className="px-3 py-2.5 font-semibold">Source</th>
                      <th className="px-3 py-2.5 font-semibold">Token</th>
                      <th className="px-3 py-2.5 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCompPlans.map((row) => (
                      <tr key={row.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                        <td className="max-w-[220px] truncate px-3 py-2.5 text-violet-200/90" title={row.email}>
                          {row.email}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-semibold capitalize text-violet-200">{row.plan_id}</span>
                        </td>
                        <td className="px-3 py-2.5 text-white/55">{row.billing}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-white/45">
                          {new Date(row.granted_at).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-white/45">
                          {new Date(row.expires_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-white/50">{row.source}</td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 text-white/55" title={row.token_label ?? ""}>
                          {row.token_label?.trim() ? row.token_label : row.token_id ? `${row.token_id.slice(0, 8)}…` : "-"}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            disabled={revokePlanId === row.id}
                            onClick={() => void revokeComplimentaryPlan(row.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-500/35 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                          >
                            {revokePlanId === row.id ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Revoking…
                              </>
                            ) : (
                              "Cancel now"
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {activeCompPlans.length === 0 && !creditLoading && (
                  <p className="py-8 text-center text-sm text-white/30">No active complimentary plans</p>
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-white/80">Redemption audit log</h2>
              <p className="mb-3 text-[11px] leading-relaxed text-white/40">
                Every successful claim is logged with user email and token reference. Watch for unusual spikes or unknown emails.
              </p>
              <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
                <table className="w-full min-w-[860px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40">
                      <th className="px-3 py-2.5 font-semibold">When</th>
                      <th className="px-3 py-2.5 font-semibold">User</th>
                      <th className="px-3 py-2.5 font-semibold">Type</th>
                      <th className="px-3 py-2.5 font-semibold">Grant</th>
                      <th className="px-3 py-2.5 font-semibold">Token label</th>
                      <th className="px-3 py-2.5 font-semibold">Token id (prefix)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditLogs.map((row) => (
                      <tr key={row.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                        <td className="whitespace-nowrap px-3 py-2.5 text-white/45">
                          {new Date(row.redeemed_at).toLocaleString()}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2.5 text-violet-200/90" title={row.email}>
                          {row.email}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.grant_type === "plan" ? (
                            <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                              Plan
                            </span>
                          ) : (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                              Credits
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-white/75">
                          {row.grant_type === "plan" ? (
                            <span>
                              <span className="font-semibold capitalize text-violet-200">{row.plan_id ?? "-"}</span>
                              {row.plan_billing && (
                                <span className="ml-1 text-white/40">({row.plan_billing})</span>
                              )}
                              {row.plan_expires_at && (
                                <span className="ml-2 text-[10px] text-white/35">
                                  until {new Date(row.plan_expires_at).toLocaleDateString()}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="tabular-nums font-medium text-amber-200/90">{row.credits}</span>
                          )}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-2.5 text-white/55" title={row.token_label ?? ""}>
                          {row.token_label?.trim() ? row.token_label : "-"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-white/35">{row.token_secret_prefix ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {creditLogs.length === 0 && !creditLoading && (
                  <p className="py-8 text-center text-sm text-white/30">No redemptions yet</p>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between px-1">
                <p className="text-[11px] text-white/40">{creditLogTotal} events</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={creditLogPage <= 1}
                    onClick={() => setCreditLogPage((p) => p - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs tabular-nums text-white/50">
                    {creditLogPage} / {creditLogTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={creditLogPage >= creditLogTotalPages}
                    onClick={() => setCreditLogPage((p) => p + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : tab === "onboarding" && onboardLoading && onboardRows.length === 0 ? (
          <div className="mt-12 flex items-center justify-center gap-2 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading onboarding…
          </div>
        ) : tab === "onboarding" ? (
          <div className="mt-4 space-y-3">
            {onboardWarning && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {onboardWarning}
              </div>
            )}
            {onboardError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {onboardError}
              </div>
            )}
            <p className="text-[11px] text-white/45">
              Emails come from Auth. Paying = Stripe subscription status active or trialing in{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/70">user_subscriptions</code>.
              Trial flag reflects app metadata (e.g. $1 trial) at load time.
            </p>
            <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full min-w-[1040px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40">
                    <th className="px-3 py-2.5 font-semibold">Email</th>
                    <th className="px-3 py-2.5 font-semibold">Work</th>
                    <th className="px-3 py-2.5 font-semibold">Referral</th>
                    <th className="px-3 py-2.5 font-semibold">Completed</th>
                    <th className="px-3 py-2.5 font-semibold">Plan</th>
                    <th className="px-3 py-2.5 font-semibold">Credits</th>
                    <th className="px-3 py-2.5 font-semibold">Sub status</th>
                    <th className="px-3 py-2.5 font-semibold">Paying</th>
                    <th className="px-3 py-2.5 font-semibold">Trial</th>
                  </tr>
                </thead>
                <tbody>
                  {onboardRows.map((row) => (
                    <tr key={row.user_id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-violet-200/90" title={row.email || row.user_id}>
                        {row.email?.trim() ? row.email : row.user_id.slice(0, 8)}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-white/70" title={row.work_type ?? ""}>
                        {row.work_type?.trim() ? row.work_type : "-"}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-white/60" title={row.referral_source ?? ""}>
                        {row.referral_source?.trim() ? row.referral_source : "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-white/45">
                        {new Date(row.completed_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-white/70">{row.plan_id ?? "-"}</td>
                      <td className="px-3 py-2.5 tabular-nums font-medium text-amber-200/90">
                        {row.credit_balance != null ? formatCreditBalanceSnap(row.credit_balance) : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-white/50">{row.sub_status ?? "-"}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            row.is_subscriber
                              ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-200"
                              : "border-white/15 bg-white/[0.05] text-white/45",
                          )}
                        >
                          {row.is_subscriber ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            row.trial_active
                              ? "border-amber-500/35 bg-amber-500/15 text-amber-200"
                              : "border-white/15 bg-white/[0.05] text-white/45",
                          )}
                        >
                          {row.trial_active ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {onboardRows.length === 0 && !onboardLoading && (
                <p className="py-8 text-center text-sm text-white/30">No onboarding rows yet</p>
              )}
            </div>
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] text-white/40">{onboardTotal} total</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={onboardPage <= 1}
                  onClick={() => setOnboardPage((p) => p - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs tabular-nums text-white/50">
                  {onboardPage} / {onboardTotalPages}
                </span>
                <button
                  type="button"
                  disabled={onboardPage >= onboardTotalPages}
                  onClick={() => setOnboardPage((p) => p + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : tab === "feedback" && feedbackLoading && feedbackRows.length === 0 ? (
          <div className="mt-12 flex items-center justify-center gap-2 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading feedback…
          </div>
        ) : tab === "feedback" ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  placeholder="Search by email, page, or message…"
                  value={feedbackSearchInput}
                  onChange={(e) => setFeedbackSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setFeedbackSearch(feedbackSearchInput);
                      setFeedbackPage(1);
                    }
                  }}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-10 pr-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-violet-400/40"
                />
              </div>
              <select
                value={feedbackCategory}
                onChange={(e) => { setFeedbackCategory(e.target.value); setFeedbackPage(1); }}
                className="rounded-lg border border-white/10 bg-[#0b0912] px-3 py-2 text-xs text-white/70 outline-none"
              >
                <option value="">All types</option>
                <option value="feedback">Feedback</option>
                <option value="feature">Feature request</option>
                <option value="bug">Bug report</option>
              </select>
            </div>
            {feedbackError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{feedbackError}</div>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40">
                    <th className="px-3 py-2.5 font-semibold">When</th>
                    <th className="px-3 py-2.5 font-semibold">Type</th>
                    <th className="px-3 py-2.5 font-semibold">User</th>
                    <th className="px-3 py-2.5 font-semibold">Page</th>
                    <th className="px-3 py-2.5 font-semibold">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {feedbackRows.map((row) => (
                    <tr key={row.id} className="border-b border-white/5 align-top transition hover:bg-white/[0.02]">
                      <td className="whitespace-nowrap px-3 py-2.5 text-white/45">{new Date(row.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                          {row.category || "feedback"}
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-violet-200/90" title={row.email ?? row.user_id}>
                        {row.email?.trim() ? row.email : row.user_id.slice(0, 8)}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-white/60" title={row.page_path ?? "-"}>
                        {row.page_path ?? "-"}
                      </td>
                      <td className="max-w-[560px] whitespace-pre-wrap px-3 py-2.5 text-white/70">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {feedbackRows.length === 0 && !feedbackLoading ? (
                <p className="py-8 text-center text-sm text-white/30">No feedback yet</p>
              ) : null}
            </div>
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] text-white/40">{feedbackTotal} total</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={feedbackPage <= 1}
                  onClick={() => setFeedbackPage((p) => p - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs tabular-nums text-white/50">
                  {feedbackPage} / {feedbackTotalPages}
                </span>
                <button
                  type="button"
                  disabled={feedbackPage >= feedbackTotalPages}
                  onClick={() => setFeedbackPage((p) => p + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : tab === "templates" ? (
          <div className="mt-4 space-y-3">
            {templateError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{templateError}</div>
            ) : null}
            {templateLoading && templateRows.length === 0 ? (
              <div className="mt-6 flex items-center justify-center gap-2 text-white/40">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading templates…
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40">
                      <th className="px-3 py-2.5 font-semibold">Template</th>
                      <th className="px-3 py-2.5 font-semibold">Creator</th>
                      <th className="px-3 py-2.5 font-semibold">Created</th>
                      <th className="px-3 py-2.5 font-semibold">Updated</th>
                      <th className="px-3 py-2.5 font-semibold">Source</th>
                      <th className="px-3 py-2.5 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateRows.map((row) => {
                      const creator =
                        (row.created_by && templateEmailMap[row.created_by]) ||
                        row.created_by_name ||
                        row.created_by ||
                        "-";
                      return (
                        <tr key={row.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                          <td className="max-w-[320px] px-3 py-2.5">
                            <p className="truncate font-medium text-white/85" title={row.name}>{row.name}</p>
                            <p className="mt-0.5 truncate text-[11px] text-white/45" title={row.blurb ?? ""}>
                              {row.blurb?.trim() || "-"}
                            </p>
                            <p className="mt-1 font-mono text-[10px] text-white/30">{row.id}</p>
                          </td>
                          <td className="max-w-[240px] truncate px-3 py-2.5 text-violet-200/90" title={creator}>{creator}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-white/45">{new Date(row.created_at).toLocaleString()}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-white/45">{new Date(row.updated_at).toLocaleString()}</td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/35 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                              <LayoutTemplate className="h-3 w-3" />
                              Community
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => void deleteWorkflowTemplate(row.id)}
                              disabled={deletingTemplateId === row.id}
                              className="inline-flex items-center gap-1 rounded-md border border-red-500/35 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                            >
                              {deletingTemplateId === row.id ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Deleting…
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-3 w-3" />
                                  Remove
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {templateRows.length === 0 && !templateLoading ? (
                  <p className="py-8 text-center text-sm text-white/30">No templates found</p>
                ) : null}
              </div>
            )}
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] text-white/40">{templateTotal} total</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={templatePage <= 1}
                  onClick={() => setTemplatePage((p) => p - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs tabular-nums text-white/50">
                  {templatePage} / {templateTotalPages}
                </span>
                <button
                  type="button"
                  disabled={templatePage >= templateTotalPages}
                  onClick={() => setTemplatePage((p) => p + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 transition hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : loading && genRows.length === 0 && runRows.length === 0 ? (
          <div className="mt-12 flex items-center justify-center gap-2 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : tab === "generations" ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40">
                  <th className="px-3 py-2.5 font-semibold">User</th>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Link to Ad URL</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Charged</th>
                  <th className="px-3 py-2.5 font-semibold">Balance after</th>
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
                  <Fragment key={row.id}>
                    <tr
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
                          <span className="text-white/25">-</span>
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
                            : "-"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-white/55" title="Ledger balance snapshot after this row was registered">
                        {formatCreditBalanceSnap(row.credit_balance_after)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="max-w-[200px] truncate block text-white/55" title={adminGenerationModelLabel(row)}>
                          {adminGenerationModelLabel(row)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="max-w-[180px] truncate block font-mono text-[11px] text-white/45" title={row.app_endpoint || ""}>
                          {row.app_endpoint?.trim() ? row.app_endpoint : "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-white/50">{row.provider}</td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-white/60" title={row.label}>
                        {row.label || "-"}
                      </td>
                      <td className="px-3 py-2.5"><MediaPreview urls={row.result_urls} /></td>
                      <td className="px-3 py-2.5 tabular-nums text-white/50 whitespace-nowrap">{durationForRow(row)}</td>
                      <td className="px-3 py-2.5 text-white/40 whitespace-nowrap">{relativeTime(row.created_at)}</td>
                    </tr>
                    {expandedGenId === row.id && (
                      <tr className="border-b border-white/5">
                        <td colSpan={13} className="bg-white/[0.02] px-4 py-3">
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
                                <p>
                                  <span className="text-white/40">Model:</span> {adminGenerationModelLabel(row)}
                                </p>
                                <p>
                                  <span className="text-white/40">Balance after register:</span>{" "}
                                  {formatCreditBalanceSnap(row.credit_balance_after)}
                                </p>
                                <p><span className="text-white/40">App API:</span> <span className="font-mono">{row.app_endpoint?.trim() ? row.app_endpoint : "-"}</span></p>
                                <p><span className="text-white/40">Duration:</span> {durationForRow(row)}</p>
                                {activePlanByUserId[row.user_id] && (
                                  <div className="mt-2 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1.5">
                                    <p className="text-[11px] text-violet-100">
                                      <span className="text-violet-300/80">Partner plan:</span>{" "}
                                      <span className="font-semibold capitalize">{activePlanByUserId[row.user_id].plan_id}</span>{" "}
                                      ({activePlanByUserId[row.user_id].billing}) until{" "}
                                      {new Date(activePlanByUserId[row.user_id].expires_at).toLocaleDateString()}
                                    </p>
                                    <button
                                      type="button"
                                      disabled={revokePlanId === activePlanByUserId[row.user_id].id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void revokeComplimentaryPlan(activePlanByUserId[row.user_id].id);
                                      }}
                                      className="mt-1 inline-flex items-center gap-1 rounded-md border border-red-500/35 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                                    >
                                      {revokePlanId === activePlanByUserId[row.user_id].id ? (
                                        <>
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                          Revoking…
                                        </>
                                      ) : (
                                        "Cancel partner plan now"
                                      )}
                                    </button>
                                  </div>
                                )}
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
                  </Fragment>
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
                  <Fragment key={row.id}>
                    <tr
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
                        ) : "-"}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-white/60">{row.title ?? "-"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-white/50">
                        {(row.generated_image_urls?.length ?? 0) + (row.packshot_urls?.length ?? 0)}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.video_url ? (
                          <a href={row.video_url} target="_blank" rel="noreferrer" className="text-violet-300 underline underline-offset-2 hover:text-violet-200 text-[11px]">
                            View video
                          </a>
                        ) : <span className="text-white/25">-</span>}
                      </td>
                      <td className="px-3 py-2.5 text-white/40 whitespace-nowrap">{relativeTime(row.updated_at)}</td>
                    </tr>
                    {expandedRunId === row.id && (
                      <tr className="border-b border-white/5">
                        <td colSpan={6} className="bg-white/[0.02] px-4 py-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Image Prompt</p>
                              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-white/70">{row.image_prompt || "-"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Video Prompt</p>
                              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-white/70">{row.video_prompt || "-"}</p>
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
                  </Fragment>
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
