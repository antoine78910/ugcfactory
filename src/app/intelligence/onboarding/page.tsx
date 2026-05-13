import { redirect } from "next/navigation";
import StudioShell from "@/app/_components/StudioShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import OnboardingPageClient from "./OnboardingPageClient";

export default async function IntelligenceOnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  return (
    <StudioShell>
      <OnboardingPageClient />
    </StudioShell>
  );
}
