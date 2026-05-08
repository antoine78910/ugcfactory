import { redirect } from "next/navigation";
import StudioShell from "@/app/_components/StudioShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IntelligenceClient } from "./IntelligenceClient";

export type IntelligenceInitialPanel = "competitors" | "recreations" | null;

export async function IntelligencePageShell({
  initialPanel = null,
  initialCompetitorId = null,
}: {
  initialPanel?: IntelligenceInitialPanel;
  initialCompetitorId?: string | null;
}) {
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
      <IntelligenceClient
        ownTrackerIds={ownTrackerIds}
        initialPanel={initialPanel}
        initialCompetitorId={initialCompetitorId}
      />
    </StudioShell>
  );
}

