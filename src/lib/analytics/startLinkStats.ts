import { createSupabaseServiceClient } from "@/lib/supabase/admin";

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
  metrics: StartLinkMetricRow[];
};

function periodSince(period: StartLinkStatsPeriod): string | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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
    configured: false,
    error,
    clicks: 0,
    signups: 0,
    payments: 0,
    metrics: buildMetrics(0, 0, 0),
  };
}

export async function fetchStartLinkStats(period: StartLinkStatsPeriod): Promise<StartLinkStatsPayload> {
  const admin = createSupabaseServiceClient();
  if (!admin) {
    return emptyPayload(period, "SUPABASE_SERVICE_ROLE_KEY non configuré.");
  }

  const since = periodSince(period);

  try {
    let clicksQ = admin.from("start_link_clicks").select("id", { count: "exact", head: true });
    let signupsQ = admin
      .from("start_link_attributions")
      .select("visitor_id", { count: "exact", head: true })
      .not("signed_up_at", "is", null);
    let paymentsQ = admin
      .from("start_link_attributions")
      .select("visitor_id", { count: "exact", head: true })
      .not("paid_at", "is", null);

    if (since) {
      clicksQ = clicksQ.gte("clicked_at", since);
      signupsQ = signupsQ.gte("signed_up_at", since);
      paymentsQ = paymentsQ.gte("paid_at", since);
    }

    const [clicksRes, signupsRes, paymentsRes] = await Promise.all([clicksQ, signupsQ, paymentsQ]);

    const tableMissing = (msg: string | undefined) =>
      Boolean(msg?.includes("start_link_clicks") || msg?.includes("start_link_attributions"));

    const errMsg =
      clicksRes.error?.message ??
      signupsRes.error?.message ??
      paymentsRes.error?.message;

    if (errMsg) {
      if (tableMissing(errMsg)) {
        return emptyPayload(
          period,
          "Tables start_link_* manquantes — exécute supabase/migrations/20260519120000_start_link_attribution.sql.",
        );
      }
      return emptyPayload(period, errMsg);
    }

    const clicks = clicksRes.count ?? 0;
    const signups = signupsRes.count ?? 0;
    const payments = paymentsRes.count ?? 0;

    return {
      period,
      configured: true,
      clicks,
      signups,
      payments,
      metrics: buildMetrics(clicks, signups, payments),
    };
  } catch (e) {
    return emptyPayload(period, e instanceof Error ? e.message : "Impossible de charger les stats /start.");
  }
}
