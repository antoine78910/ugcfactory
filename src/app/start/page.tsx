import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { recordStartLinkClick } from "@/lib/analytics/startLinkServer";
import {
  START_LINK_COOKIE,
  START_LINK_VISITOR_COOKIE,
  START_LINK_VISITOR_MAX_AGE_SEC,
  newStartLinkVisitorId,
} from "@/lib/analytics/startLinkRef";
import { marketingOrigin } from "@/lib/marketingOrigin";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Get started | Youry",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type StartSearchParams = Record<string, string | string[] | undefined>;

function marketingStartRedirectUrl(incoming: StartSearchParams): string {
  const target = new URL(`${marketingOrigin()}/`);
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || target.searchParams.has(key)) continue;
    const resolved = Array.isArray(value) ? value[0] : value;
    if (resolved) target.searchParams.set(key, resolved);
  }
  return target.toString();
}

const cookieOptions = {
  path: "/",
  maxAge: START_LINK_VISITOR_MAX_AGE_SEC,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

type StartPageProps = {
  searchParams: Promise<StartSearchParams>;
};

/**
 * Short link (youry.io/start): record click, HTTP redirect to marketing LP (no client splash).
 */
export default async function StartPage({ searchParams }: StartPageProps) {
  const resolvedParams = await searchParams;
  const store = await cookies();

  let visitorId = store.get(START_LINK_VISITOR_COOKIE)?.value?.trim() ?? "";
  const isNewVisitor = !visitorId;
  if (!visitorId) visitorId = newStartLinkVisitorId();

  const admin = createSupabaseServiceClient();
  if (admin) {
    try {
      await recordStartLinkClick(admin, visitorId);
    } catch (e) {
      console.error("[start]", e);
    }
  }

  if (isNewVisitor) {
    store.set(START_LINK_VISITOR_COOKIE, visitorId, cookieOptions);
  }
  store.set(START_LINK_COOKIE, "1", cookieOptions);

  redirect(marketingStartRedirectUrl(resolvedParams));
}
