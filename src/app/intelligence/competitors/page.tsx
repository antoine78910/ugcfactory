import { IntelligencePageShell } from "../_components/IntelligencePageShell";

export const dynamic = "force-dynamic";

export default async function IntelligenceCompetitorsPage() {
  return IntelligencePageShell({ initialPanel: "competitors" });
}

