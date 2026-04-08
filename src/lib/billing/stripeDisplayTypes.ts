import type { BillingCheckoutCurrency } from "@/lib/geo/billingRegion";
import type { CreditPackKey } from "@/lib/stripe/creditPackPrices";
import type { SubscriptionPlanId } from "@/lib/stripe/subscriptionPrices";

export type MoneyDisplay = {
  amount: number;
  formatted: string;
};

export type SubscriptionPlanMoneyDisplay = {
  monthly: MoneyDisplay | null;
  yearly: (MoneyDisplay & { perMonthAmount: number; perMonthFormatted: string }) | null;
};

export type StripeDisplayPricesPayload = {
  currency: BillingCheckoutCurrency;
  /** ISO country when inferred from request headers */
  country: string | null;
  creditPacks: Partial<Record<CreditPackKey, MoneyDisplay>>;
  subscriptions: Partial<Record<SubscriptionPlanId, SubscriptionPlanMoneyDisplay>>;
};
