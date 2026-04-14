"use client";

import { Analytics as DubAnalytics } from "@dub/analytics/react";

const DUB_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_DUB_PUBLISHABLE_KEY?.trim() ?? "dub_pk_HMcoWNyXmq6E8OQGgpK6eEcF";
const DUB_REFER_DOMAIN =
  process.env.NEXT_PUBLIC_DUB_REFER_DOMAIN?.trim() ?? "go.youry.io";

/**
 * Dub client-side conversion + referral click tracking.
 * @see https://dub.co/docs/analytics/quickstart
 */
export function DubAnalyticsInit() {
  if (!DUB_PUBLISHABLE_KEY) return null;
  return (
    <DubAnalytics
      publishableKey={DUB_PUBLISHABLE_KEY}
      domainsConfig={{
        refer: DUB_REFER_DOMAIN,
      }}
    />
  );
}
