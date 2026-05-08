import { IntelligencePageShell } from "../../_components/IntelligencePageShell";

export const dynamic = "force-dynamic";

export default async function IntelligenceCompetitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return IntelligencePageShell({ initialPanel: null, initialCompetitorId: id });
}

