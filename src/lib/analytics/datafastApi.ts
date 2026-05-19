/**
 * Server-side DataFast Analytics API (admin dashboards).
 * @see https://datafa.st/docs/api-introduction
 */

const DATAFAST_API_BASE = "https://datafa.st/api/v1";

export type StartLinkStatsPeriod = "7d" | "30d" | "all";

export type StartLinkMetricKey = "clicks" | "signups" | "payments";

export type StartLinkMetricRow = {
  key: StartLinkMetricKey;
  label: string;
  count: number;
  rateFromClicksPct: number | null;
};

export type StartLinkStatsPayload = {
  period: StartLinkStatsPeriod;
  configured: boolean;
  error?: string;
  clicks: number;
  signups: number;
  payments: number;
  revenue: number;
  metrics: StartLinkMetricRow[];
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

const SIGNUP_GOAL = "signup";
const PAYMENT_GOALS = ["subscription_paid", "trial_paid_usd", "trial_paid_eur"] as const;

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

function goalVisitors(map: Map<string, DatafastGoalsApiRow>, goal: string): number {
  const row = map.get(goal);
  return row?.visitors ?? row?.completions ?? 0;
}

function sumStartPathVisits(rows: DatafastPagesApiRow[]): number {
  let visitors = 0;
  for (const row of rows) {
    if ((row.path ?? "").trim() === "/start") visitors += row.visitors ?? 0;
  }
  return visitors;
}

function sumCohortPayments(rows: DatafastPagesApiRow[]): { payments: number; revenue: number } {
  let payments = 0;
  let revenue = 0;
  for (const row of rows) {
    payments += row.payments ?? 0;
    revenue += row.revenue ?? 0;
  }
  return { payments, revenue };
}

function rateFromClicks(count: number, clicks: number): number | null {
  if (clicks <= 0) return count > 0 ? 0 : null;
  if (count <= 0) return null;
  return Math.round((count / clicks) * 1000) / 10;
}

function buildMetrics(clicks: number, signups: number, payments: number): StartLinkMetricRow[] {
  return [
    { key: "clicks", label: "Clics (/start)", count: clicks, rateFromClicksPct: clicks > 0 ? 100 : null },
    { key: "signups", label: "Inscriptions", count: signups, rateFromClicksPct: rateFromClicks(signups, clicks) },
    { key: "payments", label: "Paiements", count: payments, rateFromClicksPct: rateFromClicks(payments, clicks) },
  ];
}

function emptyPayload(period: StartLinkStatsPeriod, error?: string): StartLinkStatsPayload {
  return {
    period,
    configured: Boolean(getDatafastApiKey()),
    error,
    clicks: 0,
    signups: 0,
    payments: 0,
    revenue: 0,
    metrics: buildMetrics(0, 0, 0),
  };
}

export async function fetchStartLinkStats(period: StartLinkStatsPeriod): Promise<StartLinkStatsPayload> {
  if (!getDatafastApiKey()) {
    return emptyPayload(period, "Ajoute DATAFAST_API_KEY (Website settings → API) dans Vercel.");
  }

  const base = { limit: "200", ...periodQuery(period) };

  const [startPageRes, cohortPageRes, goalsRes] = await Promise.all([
    datafastGet<DatafastPagesApiRow[]>("/analytics/pages", { ...base, page: "/start" }),
    datafastGet<DatafastPagesApiRow[]>("/analytics/pages", { ...base, entry_page: "/start" }),
    datafastGet<DatafastGoalsApiRow[]>("/analytics/goals", { ...base, entry_page: "/start" }),
  ]);

  const firstError = !startPageRes.ok
    ? startPageRes.message
    : !cohortPageRes.ok
      ? cohortPageRes.message
      : !goalsRes.ok
        ? goalsRes.message
        : undefined;

  const goalMap = goalsRes.ok ? goalsByName(goalsRes.data) : new Map<string, DatafastGoalsApiRow>();

  const clicks = Math.max(
    startPageRes.ok ? sumStartPathVisits(startPageRes.data) : 0,
    goalVisitors(goalMap, "start_link_visit"),
  );

  const signups = goalVisitors(goalMap, SIGNUP_GOAL);

  const paymentGoalsTotal = PAYMENT_GOALS.reduce((sum, g) => sum + goalVisitors(goalMap, g), 0);
  const cohortTotals = cohortPageRes.ok ? sumCohortPayments(cohortPageRes.data) : { payments: 0, revenue: 0 };
  const payments = Math.max(cohortTotals.payments, paymentGoalsTotal);

  return {
    period,
    configured: true,
    error: firstError,
    clicks,
    signups,
    payments,
    revenue: cohortTotals.revenue,
    metrics: buildMetrics(clicks, signups, payments),
  };
}
