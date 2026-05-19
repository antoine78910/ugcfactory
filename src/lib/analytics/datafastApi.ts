/**
 * Server-side DataFast Analytics API (admin dashboards).
 * @see https://datafa.st/docs/api-introduction
 */

const DATAFAST_API_BASE = "https://datafa.st/api/v1";

export type StartLinkStatsPeriod = "7d" | "30d" | "all";

export type StartLinkFunnelRow = {
  goal: string;
  label: string;
  completions: number;
  visitors: number;
  rateFromClicksPct: number | null;
};

export type StartLinkStatsPayload = {
  period: StartLinkStatsPeriod;
  configured: boolean;
  error?: string;
  pageVisits: number;
  pagePayments: number;
  pageRevenue: number;
  goalVisits: number;
  funnel: StartLinkFunnelRow[];
};

type DatafastGoalsApiRow = {
  goal?: string;
  name?: string;
  completions?: number;
  visitors?: number;
};

type DatafastPagesApiRow = {
  path?: string;
  visitors?: number;
  revenue?: number;
  payments?: number;
};

type DatafastApiEnvelope<T> = {
  status?: string;
  data?: T;
  error?: { message?: string };
};

const START_LINK_FUNNEL: Array<{ goal: string; label: string }> = [
  { goal: "start_link_visit", label: "Clic /start (goal)" },
  { goal: "view_signup", label: "Page signup vue" },
  { goal: "signup", label: "Inscription" },
  { goal: "signin", label: "Connexion" },
  { goal: "trial_view_setup", label: "Setup trial vu" },
  { goal: "trial_initiate_checkout", label: "Checkout trial lancé" },
  { goal: "trial_paid_usd", label: "Trial payé (USD)" },
  { goal: "trial_paid_eur", label: "Trial payé (EUR)" },
  { goal: "onboarding_start_for_free_clicked", label: "Start for free" },
  { goal: "subscription_initiate_checkout", label: "Checkout abo lancé" },
  { goal: "subscription_paid", label: "Abonnement payé" },
  { goal: "lta_url_submitted", label: "Link to Ad (URL)" },
];

function periodQuery(period: StartLinkStatsPeriod): Record<string, string> {
  if (period === "all") return {};
  const days = period === "7d" ? 7 : 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    startAt: start.toISOString().slice(0, 10),
    endAt: end.toISOString().slice(0, 10),
  };
}

function getDatafastApiKey(): string | null {
  const key = process.env.DATAFAST_API_KEY?.trim();
  return key || null;
}

async function datafastGet<T>(
  path: string,
  params: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const apiKey = getDatafastApiKey();
  if (!apiKey) {
    return { ok: false, message: "DATAFAST_API_KEY is not configured" };
  }

  const url = new URL(`${DATAFAST_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as DatafastApiEnvelope<T>;
    if (!res.ok) {
      const msg = json.error?.message ?? `DataFast HTTP ${res.status}`;
      return { ok: false, message: msg };
    }
    if (!json.data) {
      return { ok: false, message: "DataFast returned no data" };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "DataFast request failed" };
  }
}

function goalsByName(rows: DatafastGoalsApiRow[]): Map<string, DatafastGoalsApiRow> {
  const map = new Map<string, DatafastGoalsApiRow>();
  for (const row of rows) {
    const key = (row.goal ?? row.name ?? "").trim();
    if (key) map.set(key, row);
  }
  return map;
}

function sumStartPageVisits(rows: DatafastPagesApiRow[]): {
  visitors: number;
  payments: number;
  revenue: number;
} {
  let visitors = 0;
  let payments = 0;
  let revenue = 0;
  for (const row of rows) {
    const path = (row.path ?? "").trim();
    if (path !== "/start") continue;
    visitors += row.visitors ?? 0;
    payments += row.payments ?? 0;
    revenue += row.revenue ?? 0;
  }
  return { visitors, payments, revenue };
}

export async function fetchStartLinkStats(period: StartLinkStatsPeriod): Promise<StartLinkStatsPayload> {
  const configured = Boolean(getDatafastApiKey());
  if (!configured) {
    return {
      period,
      configured: false,
      error: "Ajoute DATAFAST_API_KEY (Website settings → API) dans Vercel.",
      pageVisits: 0,
      pagePayments: 0,
      pageRevenue: 0,
      goalVisits: 0,
      funnel: START_LINK_FUNNEL.map(({ goal, label }) => ({
        goal,
        label,
        completions: 0,
        visitors: 0,
        rateFromClicksPct: null,
      })),
    };
  }

  const base = { limit: "200", ...periodQuery(period) };

  const [pagesRes, goalsRes] = await Promise.all([
    datafastGet<DatafastPagesApiRow[]>("/analytics/pages", {
      ...base,
      page: "/start",
    }),
    datafastGet<DatafastGoalsApiRow[]>("/analytics/goals", {
      ...base,
      entry_page: "/start",
    }),
  ]);

  const firstError = !pagesRes.ok ? pagesRes.message : !goalsRes.ok ? goalsRes.message : undefined;

  const pageTotals = pagesRes.ok ? sumStartPageVisits(pagesRes.data) : { visitors: 0, payments: 0, revenue: 0 };
  const goalMap = goalsRes.ok ? goalsByName(goalsRes.data) : new Map<string, DatafastGoalsApiRow>();

  const goalVisits =
    goalMap.get("start_link_visit")?.visitors ??
    goalMap.get("start_link_visit")?.completions ??
    0;

  const clickBaseline = Math.max(pageTotals.visitors, goalVisits, 1);

  const funnel: StartLinkFunnelRow[] = START_LINK_FUNNEL.map(({ goal, label }) => {
    const row = goalMap.get(goal);
    const completions = row?.completions ?? 0;
    const visitors = row?.visitors ?? 0;
    const denom = clickBaseline > 0 ? clickBaseline : null;
    const rateFromClicksPct =
      denom && visitors > 0 ? Math.round((visitors / denom) * 1000) / 10 : visitors > 0 ? 0 : null;
    return { goal, label, completions, visitors, rateFromClicksPct };
  });

  return {
    period,
    configured: true,
    error: firstError,
    pageVisits: pageTotals.visitors,
    pagePayments: pageTotals.payments,
    pageRevenue: pageTotals.revenue,
    goalVisits,
    funnel,
  };
}
