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

const LS_CREDITS = "ugc_demo_credits";
const LS_PLAN = "ugc_demo_plan";
/** Bucket for % bar when plan is Free (one-off packs). */
const LS_CAP = "ugc_demo_credits_cap";
const LS_PERSONAL_API_KEY = "ugc_personal_api_key";
const LS_PERSONAL_API_ENABLED = "ugc_personal_api_enabled";

/** Returns the user's Kie API key when Personal API mode is active, or undefined. */
export function getPersonalApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (localStorage.getItem(LS_PERSONAL_API_ENABLED) !== "1") return undefined;
  const k = localStorage.getItem(LS_PERSONAL_API_KEY)?.trim();
  return k && k.length > 0 ? k : undefined;
}

/** True when the user has Personal API mode enabled with a key set. */
export function isPersonalApiActive(): boolean {
  return getPersonalApiKey() !== undefined;
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
  /** Upper bound for progress (monthly sub allocation or free pack bucket). */
  total: number;
};

function readState(): CreditsState {
  if (typeof window === "undefined") {
    return { planId: "free", current: 0, total: 0 };
  }

  const planId = parseAccountPlan(localStorage.getItem(LS_PLAN));
  let current = Number(localStorage.getItem(LS_CREDITS));
  if (!Number.isFinite(current) || current < 0) current = 0;

  if (planId !== "free") {
    const alloc = subscriptionCredits(planId);
    const total = Math.max(alloc, current);
    return { planId, current, total };
  }

  const capRaw = Number(localStorage.getItem(LS_CAP));
  const cap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 0;
  /** Purchased bucket for Free; does not shrink when spending. */
  const total = cap > 0 ? cap : current;
  return { planId: "free", current, total };
}

function persist(state: CreditsState) {
  localStorage.setItem(LS_PLAN, state.planId);
  localStorage.setItem(LS_CREDITS, String(state.current));
  if (state.planId === "free") {
    localStorage.setItem(LS_CAP, String(state.total));
  } else {
    localStorage.removeItem(LS_CAP);
  }
}

type CreditsPlanContextValue = CreditsState & {
  planDisplayName: string;
  /** 0–100, credits remaining vs total bucket */
  percentRemaining: number;
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
    usage: { ads: "~6–7 ads", videos: "~30 videos", images: "~350 images" },
    cardBorder: "border-white/10",
    btnClass: "bg-white text-black hover:bg-white/90",
  },
  {
    id: "growth" as const,
    name: "Growth",
    monthly: SUBSCRIPTIONS[1].price_usd,
    credits: SUBSCRIPTIONS[1].credits_per_month,
    usage: { ads: "~15–17 ads", videos: "~70 videos", images: "~900 images" },
    cardBorder: "border-sky-400/35",
    btnClass: "bg-sky-400 text-white hover:bg-sky-300",
    popular: true,
  },
  {
    id: "pro" as const,
    name: "Pro",
    monthly: SUBSCRIPTIONS[2].price_usd,
    credits: SUBSCRIPTIONS[2].credits_per_month,
    usage: { ads: "~35–40 ads", videos: "~150 videos", images: "~2 000 images" },
    cardBorder: "border-white/10",
    btnClass: "bg-white text-black hover:bg-white/90",
  },
  {
    id: "scale" as const,
    name: "Scale",
    monthly: SUBSCRIPTIONS[3].price_usd,
    credits: SUBSCRIPTIONS[3].credits_per_month,
    usage: { ads: "~80–90 ads", videos: "~350 videos", images: "~4 500 images" },
    cardBorder: "border-violet-500/40",
    btnClass: "bg-violet-500 text-white hover:bg-violet-400",
  },
];

const CreditsPlanContext = createContext<CreditsPlanContextValue | null>(null);

export function CreditsPlanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CreditsState>(readState);

  const syncFromStorage = useCallback(() => {
    setState(readState());
  }, []);

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

  const commit = useCallback((next: CreditsState) => {
    persist(next);
    setState(next);
  }, []);

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
      const prev = readState();
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
    [commit],
  );

  const spendCredits = useCallback(
    (n: number) => {
      const k = Math.max(0, Math.floor(n));
      if (k === 0) return;
      const prev = readState();
      const nextCurrent = Math.max(0, prev.current - k);
      const nextTotal =
        prev.planId === "free"
          ? prev.total
          : Math.max(subscriptionCredits(prev.planId), nextCurrent);
      commit({ ...prev, current: nextCurrent, total: nextTotal });
    },
    [commit],
  );

  const grantCredits = useCallback(
    (n: number) => {
      const k = Math.max(0, Math.floor(n));
      if (k === 0) return;
      const prev = readState();
      const nextCurrent = prev.current + k;
      const nextTotal =
        prev.planId === "free"
          ? Math.max(prev.total, nextCurrent)
          : Math.max(subscriptionCredits(prev.planId), nextCurrent);
      commit({ planId: prev.planId, current: nextCurrent, total: nextTotal });
    },
    [commit],
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
    const planId = parseAccountPlan(localStorage.getItem(LS_PLAN));
    let current = Number(localStorage.getItem(LS_CREDITS));
    if (!Number.isFinite(current) || current < 0) current = 0;
    const nextCurrent = current + add;
    if (planId === "free") {
      const capRaw = Number(localStorage.getItem(LS_CAP));
      const cap = Number.isFinite(capRaw) && capRaw >= 0 ? capRaw : 0;
      const nextCap = cap + add;
      localStorage.setItem(LS_CREDITS, String(nextCurrent));
      localStorage.setItem(LS_CAP, String(nextCap));
    } else {
      localStorage.setItem(LS_CREDITS, String(nextCurrent));
    }
    applied = true;
  }

  const plan = params.get("plan");
  if (!applied && onSubscription && plan && isSubscriptionPlanId(plan)) {
    const alloc = subscriptionCredits(plan);
    localStorage.setItem(LS_PLAN, plan);
    localStorage.setItem(LS_CREDITS, String(alloc));
    localStorage.removeItem(LS_CAP);
    applied = true;
  }

  if (applied) {
    window.dispatchEvent(new Event("ugc-credits-storage"));
    const clean = pathname.split("?")[0] ?? pathname;
    window.history.replaceState({}, "", clean);
  }
  return applied;
}
