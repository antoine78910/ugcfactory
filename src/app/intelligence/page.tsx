import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import StudioShell from "@/app/_components/StudioShell";
import { IntelligenceClient } from "./_components/IntelligenceClient";

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  let ownTrackerIds: string[] = [];
  try {
    const { data } = await supabase
      .from("intelligence_trackers")
      .select("tracker_id")
      .order("created_at", { ascending: false });
    ownTrackerIds = (data ?? []).map((r) => r.tracker_id as string);
  } catch {
    // non-fatal
  }

  return (
    <StudioShell>
      <IntelligenceClient ownTrackerIds={ownTrackerIds} />
    </StudioShell>
  );
}
