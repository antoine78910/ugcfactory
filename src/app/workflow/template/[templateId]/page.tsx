import type { Metadata } from "next";

import StudioShell from "@/app/_components/StudioShell";

import { WorkflowTemplatePreview } from "../../WorkflowEditor";

export const metadata: Metadata = {
  title: "Workflow template | Youry",
  description: "Preview a workflow template and copy it into your workflow.",
};

export default async function WorkflowTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;

  return (
    <StudioShell>
      <WorkflowTemplatePreview templateId={templateId} />
    </StudioShell>
  );
}
