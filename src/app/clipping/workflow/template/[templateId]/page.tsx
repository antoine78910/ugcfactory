import type { Metadata } from "next";
import { WorkflowTemplatePreview } from "@/app/workflow/WorkflowEditor";

export const metadata: Metadata = {
  title: "Clipping workflow template | Youry",
  description: "Read-only clipping preview for workflow templates.",
  robots: { index: false, follow: false },
};

export default async function ClippingWorkflowTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  return <WorkflowTemplatePreview templateId={templateId} />;
}

