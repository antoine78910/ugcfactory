"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CREDIT_PACKS, SUBSCRIPTIONS } from "@/lib/pricing";
import {
  CREDIT_PACK_KEYS,
  type CreditPackKey,
  isCreditPackKey,
} from "@/lib/stripe/creditPackPrices";
import {
  type SubscriptionPlanId,
  isSubscriptionPlanId,
} from "@/lib/stripe/subscriptionPrices";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { displayCreditsToLedgerTicks } from "@/lib/creditLedgerTicks";

// ---------------------------------------------------------------------------
// localStorage keys — bare (no namespace).
// Cross-account isolation is handled via LS_OWNER (see below).
// ---------------------------------------------------------------------------
const LS_CREDITS = "ugc_demo_credits";
const LS_PLAN = "ugc_demo_plan";
/** Bucket ceiling for the % bar when plan is Free (one-off packs). */
const LS_CAP = "ugc_demo_credits_cap";
/** userId that owns the current credits/plan data. */
const LS_OWNER = "ugc_demo_owner";
/**
 * Unix ms timestamp of the last successful checkout.
 * Used for a 5-minute grace period so we don't overwrite the plan with "free"
 * when the Stripe webhook hasn't fired yet.
 */
const LS_CHECKOUT_TS = "ugc_demo_checkout_ts";

const LS_PERSONAL_API_KEY = "ugc_personal_api_key";
const LS_PERSONAL_API_ENABLED = "ugc_personal_api_enabled";
const LS_PIAPI_PERSONAL_KEY = "ugc_piapi_personal_api_key";
const LS_PIAPI_PERSONAL_ENABLED = "ugc_piapi_personal_api_enabled";
const LS_ELEVENLABS_PERSONAL_KEY = "ugc_elevenlabs_personal_api_key";
const LS_ELEVENLABS_PERSONAL_ENABLED = "ugc_elevenlabs_personal_api_enabled";

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore storage errors */
  }
}

function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Called when the server confirms this is a founder account (autoEnablePersonalApi: true).
 * If the user already has API keys stored in localStorage but hasn't toggled them on,
 * this silently enables them — so founders never need to visit /apitest manually.
 * Only sets the "enabled" flag; never creates or overwrites actual key values.
 */
function autoEnableFounderApiKeys() {
  const kieKey = lsGet(LS_PERSONAL_API_KEY)?.trim();
  if (kieKey && kieKey.length > 0) {
    lsSet(LS_PERSONAL_API_ENABLED, "1");
  }
  const piapiKey = lsGet(LS_PIAPI_PERSONAL_KEY)?.trim();
  if (piapiKey && piapiKey.length > 0) {
    lsSet(LS_PIAPI_PERSONAL_ENABLED, "1");
  }
  const elevenKey = lsGet(LS_ELEVENLABS_PERSONAL_KEY)?.trim();
  if (elevenKey && elevenKey.length > 0) {
    lsSet(LS_ELEVENLABS_PERSONAL_ENABLED, "1");
  }
}

/** Wipe plan/credits data (but not API keys). */
function clearPlanData() {
  lsRemove(LS_PLAN);
  lsRemove(LS_CREDITS);
  lsRemove(LS_CAP);
  lsRemove(LS_OWNER);
  lsRemove(LS_CHECKOUT_TS);
}

/** Returns the user's Kie API key when Personal API mode is active, or undefined. */
export function getPersonalApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (lsGet(LS_PERSONAL_API_ENABLED) !== "1") return undefined;
  const k = lsGet(LS_PERSONAL_API_KEY)?.trim();
  return k && k.length > 0 ? k : undefined;
}

/** True when the user has Personal API mode enabled with a key set. */
export function isPersonalApiActive(): boolean {
  return getPersonalApiKey() !== undefined;
}

/** Returns the user's PiAPI key when PiAPI mode is active, or undefined. */
export function getPersonalPiapiApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (lsGet(LS_PIAPI_PERSONAL_ENABLED) !== "1") return undefined;
  const k = lsGet(LS_PIAPI_PERSONAL_KEY)?.trim();
  return k && k.length > 0 ? k : undefined;
}

export function isPersonalPiapiActive(): boolean {
  return getPersonalPiapiApiKey() !== undefined;
}

/** Returns the user's ElevenLabs API key when ElevenLabs personal mode is active, or undefined. */
export function getPersonalElevenLabsApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (lsGet(LS_ELEVENLABS_PERSONAL_ENABLED) !== "1") return undefined;
  const k = lsGet(LS_ELEVENLABS_PERSONAL_KEY)?.trim();
  return k && k.length > 0 ? k : undefined;
}

export function isPersonalElevenLabsActive(): boolean {
  return getPersonalElevenLabsApiKey() !== undefined;
}

/**
 * When either personal KIE or PiAPI key is enabled, skip platform credit charges and
 * balance checks in the studio (you bill the provider directly).
 */
export function isPlatformCreditBypassActive(): boolean {
  return isPersonalApiActive() || isPersonalPiapiActive();
}

export type AccountPlanId = "free" | SubscriptionPlanId;

function subscriptionCredits(planId: SubscriptionPlanId): number {
  const idx = (["starter", "growth", "pro", "scale"] as const).indexOf(planId);
  const row = idx >= 0 ? SUBSCRIPTIONS[idx] : SUBSCRIPTIONS[0];
  return row.credits_per_month;
}

function parseAccountPlan(raw: string | null): AccountPlanId {
  if (!raw || raw === "free") return "free";
  if (isSubscriptionPlanId(raw)) return raw;
  return "free";
}

export function creditsForPackKey(packKey: CreditPackKey): number {
  const i = CREDIT_PACK_KEYS.indexOf(packKey);
  return CREDIT_PACKS[i]?.credits ?? 0;
}

type CreditsState = {
  planId: AccountPlanId;
  current: number;
  /** Upper bound for progress bar (monthly allocation or free pack bucket). */
  total: number;
};

/**
 * Read credits/plan state from localStorage.
 * If `currentUserId` is provided and the stored owner differs, returns free/0
 * so stale data from a previous account is never shown to a new user.
 */
function readState(currentUserId?: string | null): CreditsState {
  if (typeof window === "undefined") {
    return { planId: "free", current: 0, total: 0 };
  }

  // Cross-account guard: ignore data that belongs to a different user.
  if (currentUserId) {
    const owner = lsGet(LS_OWNER);
    if (owner && owner !== currentUserId) {
      return { planId: "free", current: 0, total: 0 };
    }
  }

  const planId = parseAccountPlan(lsGet(LS_PLAN));
  let current = Number(lsGet(LS_CREDITS));
  if (!Number.isFinite(current) || current < 0) current = 0;

  if (planId !== "free") {
    const alloc = subscriptionCredits(planId);
    const total = Math.max(alloc, current);
    return { planId, current, total };
  }

  const capRaw = Number(lsGet(LS_CAP));
  const cap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 0;
  const total = cap > 0 ? cap : current;
  return { planId: "free", current, total };
}

function persist(state: CreditsState, ownerId?: string | null) {
  lsSet(LS_PLAN, state.planId);
  lsSet(LS_CREDITS, String(state.current));
  if (ownerId) lsSet(LS_OWNER, ownerId);
  if (state.planId === "free") {
    lsSet(LS_CAP, String(state.total));
  } else {
    lsRemove(LS_CAP);
  }
}

type CreditsPlanContextValue = CreditsState & {
  planDisplayName: string;
  /** 0–100, credits remaining vs total bucket */
  percentRemaining: number;
  /** True when the server confirmed this account has unlimited access (no credit deduction). */
  isUnlimited: boolean;
  setSubscriptionPlan: (planId: SubscriptionPlanId) => void;
  addPackCredits: (packKey: CreditPackKey) => void;
  spendCredits: (n: number) => void;
  /** Add credits back (e.g. refund a failed client-side charge). */
  grantCredits: (n: number) => void;
  /** For upgrade modal: paid tiers only */
  subscriptionTiers: typeof SUBSCRIPTION_TIERS;
};

const SUBSCRIPTION_TIERS = [
  {
    id: "starter" as const,
    name: "Starter",
    monthly: SUBSCRIPTIONS[0].price_usd,
    credits: SUBSCRIPTIONS[0].credits_per_month,
    usage: { linkToAd: "4", images: "125", videos: "24" },
    cardBorder: "border-white/10",
    btnClass: "bg-white text-black hover:bg-white/90",
  },
  {
    id: "growth" as const,
    name: "Growth",
    monthly: SUBSCRIPTIONS[1].price_usd,
    credits: SUBSCRIPTIONS[1].credits_per_month,
    usage: { linkToAd: "10", images: "300", videos: "60" },
    cardBorder: "border-sky-400/35",
    btnClass: "bg-sky-400 text-white hover:bg-sky-300",
    popular: true,
  },
  {
    id: "pro" as const,
    name: "Pro",
    monthly: SUBSCRIPTIONS[2].price_usd,
    credits: SUBSCRIPTIONS[2].credits_per_month,
    usage: { linkToAd: "24", images: "700", videos: "140" },
    cardBorder: "border-white/10",
    btnClass: "bg-white text-black hover:bg-white/90",
  },
  {
    id: "scale" as const,
    name: "Scale",
    monthly: SUBSCRIPTIONS[3].price_usd,
    credits: SUBSCRIPTIONS[3].credits_per_month,
    usage: { linkToAd: "55", images: "1600", videos: "320" },
    cardBorder: "border-violet-500/40",
    btnClass: "bg-violet-500 text-white hover:bg-violet-400",
  },
];

const CreditsPlanContext = createContext<CreditsPlanContextValue | null>(null);

export function CreditsPlanProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId?: string | null;
}) {
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId ?? null);
  const [state, setState] = useState<CreditsState>(() => readState(userId ?? null));
  const [isUnlimited, setIsUnlimited] = useState(false);

  // Re-read when userId becomes available (SSR hydration) or changes (login/logout).
  useEffect(() => {
    setResolvedUserId(userId ?? null);
    setState(readState(userId ?? null));
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    try {
      const supabase = createSupabaseBrowserClient();
      void supabase.auth.getUser().then(({ data }) => {
        if (!cancelled) setResolvedUserId(data.user?.id ?? null);
      });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!cancelled) setResolvedUserId(session?.user?.id ?? null);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Public pages without Supabase config can stay anonymous.
    }

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const activeUserId = resolvedUserId ?? null;

  // ---------------------------------------------------------------------------
  // DB sync — runs once on mount.
  //
  // Always fetches the authoritative plan from the server.
  // The API also returns the confirmed userId, which is used to:
  //   1. Detect a different account → clear stale data
  //   2. Stamp LS_OWNER so future reads know who owns this data
  //
  // Grace period: if a checkout happened < 5 min ago and the server still says
  // "free" (webhook not yet processed), we keep the plan from consumeCheckoutQueryParams.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Skip when not authenticated — avoids a guaranteed 401 on public pages.
    if (!activeUserId) return;
    fetch("/api/me/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { planId: string; userId?: string; unlimited?: boolean; autoEnablePersonalApi?: boolean; creditBalance?: number } | null) => {
        if (!data) return;

        // Founder account: auto-enable stored personal API keys if they exist.
        if (data.autoEnablePersonalApi === true) {
          autoEnableFounderApiKeys();
        }

        // Unlimited accounts: flag them and apply the top plan — never deduct credits.
        if (data.unlimited === true) {
          setIsUnlimited(true);
          const confirmedUid = data.userId ?? null;
          if (confirmedUid) lsSet(LS_OWNER, confirmedUid);
          setState({ planId: "scale", current: 999_999, total: 999_999 });
          return;
        }

        const confirmedUid = data.userId ?? null;
        const serverPlan = parseAccountPlan(data.planId);

        // Detect a different account — clear stale data before applying.
        if (confirmedUid) {
          const storedOwner = lsGet(LS_OWNER);
          if (storedOwner && storedOwner !== confirmedUid) {
            clearPlanData();
          }
          lsSet(LS_OWNER, confirmedUid);
        }

        // Server-authoritative credit balance from the ledger.
        // This reflects expiration and non-accumulation rules.
        const serverBalance = typeof data.creditBalance === "number" && Number.isFinite(data.creditBalance)
          ? data.creditBalance
          : null;

        if (serverPlan === "free") {
          // Check grace period: if checkout happened < 5 min ago, the webhook may
          // not have fired yet — keep the plan written by consumeCheckoutQueryParams.
          const ts = Number(lsGet(LS_CHECKOUT_TS));
          const inGrace = Number.isFinite(ts) && Date.now() - ts < 5 * 60 * 1000;
          if (inGrace) return;

          // Server is authoritative: apply free plan with ledger balance.
          const localPlan = parseAccountPlan(lsGet(LS_PLAN));
          if (localPlan !== "free" || serverBalance !== null) {
            lsSet(LS_PLAN, "free");
            const bal = serverBalance ?? 0;
            lsSet(LS_CREDITS, String(bal));
            lsSet(LS_CAP, String(bal));
            setState(readState(confirmedUid));
          }
          return;
        }

        // Server confirms a paid plan — apply it with the authoritative ledger balance.
        const alloc = subscriptionCredits(serverPlan);
        lsSet(LS_PLAN, serverPlan);
        if (serverBalance !== null) {
          lsSet(LS_CREDITS, String(serverBalance));
        } else {
          const localCredits = Number(lsGet(LS_CREDITS));
          if (!Number.isFinite(localCredits) || localCredits > alloc * 2) {
            lsSet(LS_CREDITS, String(alloc));
          }
        }
        setState(readState(confirmedUid));
      })
      .catch(() => {
        /* network error — keep local state */
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUserId]);

  const syncFromStorage = useCallback(() => {
    setState(readState(activeUserId));
  }, [activeUserId]);

  useEffect(() => {
    syncFromStorage();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_CREDITS || e.key === LS_PLAN || e.key === LS_CAP) syncFromStorage();
    };
    const onLocal = () => syncFromStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener("ugc-credits-storage", onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ugc-credits-storage", onLocal);
    };
  }, [syncFromStorage]);

  const commit = useCallback(
    (next: CreditsState) => {
      persist(next, activeUserId);
      setState(next);
    },
    [activeUserId],
  );

  const setSubscriptionPlan = useCallback(
    (planId: SubscriptionPlanId) => {
      const alloc = subscriptionCredits(planId);
      commit({ planId, current: alloc, total: alloc });
    },
    [commit],
  );

  const addPackCredits = useCallback(
    (packKey: CreditPackKey) => {
      const add = creditsForPackKey(packKey);
      if (add <= 0) return;
      const prev = readState(activeUserId);
      const nextCurrent = prev.current + add;
      if (prev.planId === "free") {
        const nextTotal = prev.total + add;
        commit({ planId: "free", current: nextCurrent, total: nextTotal });
      } else {
        const alloc = subscriptionCredits(prev.planId);
        commit({
          planId: prev.planId,
          current: nextCurrent,
          total: Math.max(alloc, nextCurrent),
        });
      }
    },
    [activeUserId, commit],
  );

  const spendCredits = useCallback(
    (n: number) => {
      // Unlimited accounts are never charged.
      if (isUnlimited) return;
      const amount = Number(n);
      if (!Number.isFinite(amount) || amount <= 0 || displayCreditsToLedgerTicks(amount) <= 0) return;
      const prev = readState(activeUserId);
      const nextCurrent = Math.max(0, prev.current - amount);
      const nextTotal =
        prev.planId === "free"
          ? prev.total
          : Math.max(subscriptionCredits(prev.planId), nextCurrent);
      commit({ ...prev, current: nextCurrent, total: nextTotal });

      // Server-side ledger deduction (fire-and-forget)
      void fetch("/api/me/credits/spend", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      }).catch(() => {});
    },
    [activeUserId, commit, isUnlimited],
  );

  const grantCredits = useCallback(
    (n: number) => {
      const amount = Number(n);
      if (!Number.isFinite(amount) || amount <= 0 || displayCreditsToLedgerTicks(amount) <= 0) return;
      const prev = readState(activeUserId);
      const nextCurrent = prev.current + amount;
      const nextTotal =
        prev.planId === "free"
          ? Math.max(prev.total, nextCurrent)
          : Math.max(subscriptionCredits(prev.planId), nextCurrent);
      commit({ planId: prev.planId, current: nextCurrent, total: nextTotal });

      // Server-side ledger refund (fire-and-forget)
      void fetch("/api/me/credits/refund", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      }).catch(() => {});
    },
    [activeUserId, commit],
  );

  const planDisplayName = useMemo(() => {
    if (state.planId === "free") return "Free";
    return SUBSCRIPTION_TIERS.find((t) => t.id === state.planId)?.name ?? state.planId;
  }, [state.planId]);

  const percentRemaining = useMemo(() => {
    if (state.total <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((state.current / state.total) * 100)));
  }, [state.current, state.total]);

  const value = useMemo(
    () => ({
      ...state,
      planDisplayName,
      percentRemaining,
      isUnlimited,
      setSubscriptionPlan,
      addPackCredits,
      spendCredits,
      grantCredits,
      subscriptionTiers: SUBSCRIPTION_TIERS,
    }),
    [
      state,
      planDisplayName,
      percentRemaining,
      isUnlimited,
      setSubscriptionPlan,
      addPackCredits,
      spendCredits,
      grantCredits,
    ],
  );

  return <CreditsPlanContext.Provider value={value}>{children}</CreditsPlanContext.Provider>;
}

export function useCreditsPlan() {
  const ctx = useContext(CreditsPlanContext);
  if (!ctx) throw new Error("useCreditsPlan must be used within CreditsPlanProvider");
  return ctx;
}

export function useCreditsPlanOptional() {
  return useContext(CreditsPlanContext);
}

/** Apply checkout success query params once (client); fires sync event for provider. */
export function consumeCheckoutQueryParams(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  if (checkout !== "success") return false;

  const onCredits = pathname.endsWith("/credits");
  const onSubscription = pathname.endsWith("/subscription");

  let applied = false;
  const pack = params.get("pack");
  if (onCredits && pack && isCreditPackKey(pack)) {
    const add = creditsForPackKey(pack);
    const planId = parseAccountPlan(lsGet(LS_PLAN));
    let current = Number(lsGet(LS_CREDITS));
    if (!Number.isFinite(current) || current < 0) current = 0;
    const nextCurrent = current + add;
    if (planId === "free") {
      const capRaw = Number(lsGet(LS_CAP));
      const cap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 0;
      lsSet(LS_CREDITS, String(nextCurrent));
      lsSet(LS_CAP, String(cap + add));
    } else {
      lsSet(LS_CREDITS, String(nextCurrent));
    }
    applied = true;
  }

  const plan = params.get("plan");
  if (!applied && onSubscription && plan && isSubscriptionPlanId(plan)) {
    const alloc = subscriptionCredits(plan);
    lsSet(LS_PLAN, plan);
    lsSet(LS_CREDITS, String(alloc));
    lsRemove(LS_CAP);
    applied = true;
  }

  if (applied) {
    // Stamp checkout timestamp for the DB sync grace period.
    lsSet(LS_CHECKOUT_TS, String(Date.now()));
    window.dispatchEvent(new Event("ugc-credits-storage"));
    const clean = pathname.split("?")[0] ?? pathname;
    window.history.replaceState({}, "", clean);
  }
  return applied;
}
