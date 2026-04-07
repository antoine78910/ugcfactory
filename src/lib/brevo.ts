/**
 * Brevo (ex-Sendinblue) server-side helpers.
 * - upsert contact (create or update)
 * - track custom events (`signup`, `payment`, etc.)
 *
 * All calls are fire-and-forget safe (never throw to the caller).
 * Set BREVO_API_KEY in environment to enable.
 */

import { serverLog } from "@/lib/serverLog";

const BREVO_API_KEY = () => process.env.BREVO_API_KEY?.trim() ?? "";
const BREVO_BASE = "https://api.brevo.com/v3";

/** List IDs contacts are auto-added to on creation (set in .env or hard-code yours). */
const BREVO_DEFAULT_LIST_IDS: number[] = (() => {
  const raw = process.env.BREVO_DEFAULT_LIST_IDS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
})();

// ---------------------------------------------------------------------------
// Low-level fetch
// ---------------------------------------------------------------------------

async function brevoFetch(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const key = BREVO_API_KEY();
  if (!key) return { ok: false, status: 0, data: "BREVO_API_KEY not set" };

  const url = `${BREVO_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": key,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body (204 / 201) is expected */
  }
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create or update a Brevo contact.
 * `attributes` keys must exist in your Brevo account (e.g. FIRSTNAME, PLAN, etc.).
 */
export async function brevoUpsertContact(
  email: string,
  attributes?: Record<string, string | number | boolean>,
  listIds?: number[],
): Promise<void> {
  try {
    const lists = listIds?.length ? listIds : BREVO_DEFAULT_LIST_IDS.length ? BREVO_DEFAULT_LIST_IDS : undefined;
    await brevoFetch("/contacts", {
      email,
      updateEnabled: true,
      ...(attributes ? { attributes } : {}),
      ...(lists ? { listIds: lists } : {}),
    });
  } catch (e) {
    serverLog("brevo_upsert_contact_error", {
      email,
      error: e instanceof Error ? e.message : "unknown",
    });
  }
}

/**
 * Track a custom event for a contact (identified by email).
 * `eventProperties` are event-specific metadata (plan, amount, etc.).
 * `contactProperties` update the contact attributes at the same time.
 */
export async function brevoTrackEvent(
  email: string,
  eventName: string,
  opts?: {
    eventProperties?: Record<string, unknown>;
    contactProperties?: Record<string, string | number | boolean>;
  },
): Promise<void> {
  try {
    const { ok, status, data } = await brevoFetch("/events", {
      event_name: eventName,
      identifiers: { email_id: email },
      ...(opts?.eventProperties ? { event_properties: opts.eventProperties } : {}),
      ...(opts?.contactProperties ? { contact_properties: opts.contactProperties } : {}),
    });
    if (!ok) {
      serverLog("brevo_track_event_fail", { email, eventName, status, data });
    }
  } catch (e) {
    serverLog("brevo_track_event_error", {
      email,
      eventName,
      error: e instanceof Error ? e.message : "unknown",
    });
  }
}
