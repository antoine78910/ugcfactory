import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import OnboardingClient from "./OnboardingClient";

function OnboardingShellFallback() {
  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-[#050507] text-white">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#050507]/85 backdrop-blur-md supports-[backdrop-filter]:bg-[#050507]/20">
        <div className="mx-auto flex min-w-0 max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="h-8 w-28 animate-pulse rounded-lg bg-white/[0.08]" />
        </div>
      </header>
      <div className="flex justify-center pt-24 text-sm text-white/40">Loading…</div>
    </div>
  );
}

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  return (
    <Suspense fallback={<OnboardingShellFallback />}>
      <OnboardingClient />
    </Suspense>
  );
}
