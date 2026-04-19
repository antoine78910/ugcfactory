const DUB_API_BASE_URL = "https://api.dub.co";

type DubApiOptions = {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export type DubTrackLeadPayload = {
  clickId: string;
  eventName: string;
  customerExternalId: string;
  customerName?: string;
  customerEmail?: string;
  customerAvatar?: string;
  mode?: "async" | "wait" | "deferred";
  eventQuantity?: number;
  metadata?: Record<string, unknown>;
};

export type DubTrackLeadResponse = {
  click: { id: string };
  link: unknown;
  customer: {
    name: string | null;
    email: string | null;
    avatar: string | null;
    externalId: string | null;
  };
};

export type DubTrackSalePayload = {
  customerExternalId: string;
  amount: number;
  currency?: string;
  eventName?: string;
  paymentProcessor?: "stripe" | "shopify" | "polar" | "paddle" | "revenuecat" | "custom";
  invoiceId?: string;
  metadata?: Record<string, unknown>;
  leadEventName?: string;
  clickId?: string;
  customerName?: string;
  customerEmail?: string;
  customerAvatar?: string;
};

export type DubTrackSaleResponse = {
  eventName: string;
  customer: unknown;
  sale: unknown;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function postDubJson<TResponse>(
  path: string,
  payload: Record<string, unknown>,
  options: DubApiOptions,
): Promise<TResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${trimTrailingSlash(options.baseUrl ?? DUB_API_BASE_URL)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const raw = await response.text();
  const json = raw ? (JSON.parse(raw) as TResponse | { error?: { message?: string } | string }) : null;

  if (!response.ok) {
    const errorMessage =
      json && typeof json === "object" && "error" in json
        ? typeof json.error === "string"
          ? json.error
          : json.error?.message || raw
        : raw;
    throw new Error(`Dub API ${response.status}: ${errorMessage || "Unknown error"}`);
  }

  if (!json) {
    throw new Error(`Dub API ${response.status}: Empty response body`);
  }

  return json as TResponse;
}

export function getDubApiToken(): string | null {
  const token = process.env.DUB_API_KEY?.trim();
  if (!token) {
    console.warn("[Dub] DUB_API_KEY is not set — tracking disabled. Add it to your Vercel env vars.");
    return null;
  }
  return token;
}

export async function postDubTrackLead(
  payload: DubTrackLeadPayload,
  options: DubApiOptions,
): Promise<DubTrackLeadResponse> {
  return postDubJson<DubTrackLeadResponse>("/track/lead", payload, options);
}

export async function postDubTrackSale(
  payload: DubTrackSalePayload,
  options: DubApiOptions,
): Promise<DubTrackSaleResponse> {
  return postDubJson<DubTrackSaleResponse>("/track/sale", payload, options);
}
