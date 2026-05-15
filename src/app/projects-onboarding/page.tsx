import { Suspense } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import BrandOnboardingClient from "./BrandOnboardingClient";

function BrandOnboardingFallback() {
  return (
    <div className="min-h-[100dvh] bg-[#050507] px-4 py-16 text-center text-sm text-white/50">Loading…</div>
  );
}

export default async function ProjectsOnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin?redirect=" + encodeURIComponent("/projects-onboarding"));

  return (
    <Suspense fallback={<BrandOnboardingFallback />}>
      <BrandOnboardingClient />
    </Suspense>
  );
}
