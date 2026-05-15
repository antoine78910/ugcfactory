import { Suspense } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import BrandProjectEditClient from "./BrandProjectEditClient";

function Fallback() {
  return <div className="min-h-[40vh] bg-[#050507] p-8 text-center text-sm text-white/50">Loading…</div>;
}

export default async function BrandProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    redirect("/signin?redirect=" + encodeURIComponent(`/projects-onboarding/projects/${id}`));

  const { data, error } = await supabase.from("brand_projects").select("id").eq("id", id).maybeSingle();
  if (error || !data) redirect("/projects-onboarding/projects");

  return (
    <Suspense fallback={<Fallback />}>
      <BrandProjectEditClient projectId={id} />
    </Suspense>
  );
}
