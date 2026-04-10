import type { Metadata } from "next";

import StudioShell from "@/app/_components/StudioShell";

import { WorkflowEditor } from "../../WorkflowEditor";

export const metadata: Metadata = {
  title: "Workflow space | Youry",
  description: "Plan nodes, pages, and lab folders in your workflow space.",
};

export default async function WorkflowSpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;

  return (
    <StudioShell>
      <WorkflowEditor spaceId={spaceId} />
    </StudioShell>
  );
}
