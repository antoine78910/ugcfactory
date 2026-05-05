import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ttListTrackers } from "@/lib/trendtrack";
import { getCached } from "@/lib/trendtrackCache";
import type { TTTracker } from "@/lib/trendtrack";
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
    const cached = await getCached<TTTracker[]>("trackers:list");
    const trackers = cached ?? (await ttListTrackers());
    ownTrackerIds = trackers.map((t) => t.id);
  } catch {
    // non-fatal
  }

  return <IntelligenceClient ownTrackerIds={ownTrackerIds} />;
}
