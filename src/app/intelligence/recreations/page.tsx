import { IntelligencePageShell } from "../_components/IntelligencePageShell";

export const dynamic = "force-dynamic";

export default async function IntelligenceRecreationsPage() {
  return IntelligencePageShell({ initialPanel: "recreations" });
}

