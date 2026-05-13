"use client";

import { useRouter } from "next/navigation";
import { IntelligenceOnboarding } from "@/app/intelligence/_components/IntelligenceOnboarding";

export default function OnboardingPageClient() {
  const router = useRouter();

  return <IntelligenceOnboarding onDone={() => router.push("/intelligence")} />;
}
