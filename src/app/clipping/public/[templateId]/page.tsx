import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkflowTemplatePreview } from "@/app/workflow/WorkflowEditor";

export const metadata: Metadata = {
  title: "Workflow template | Youry",
  description: "View a workflow template and copy it into your workspace.",
  robots: { index: false, follow: false },
};

function PublicWorkflowTemplateInner({ templateId }: { templateId: string }) {
  return <WorkflowTemplatePreview templateId={templateId} variant="public" />;
}

export default async function ClippingPublicWorkflowTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#06070d] text-sm text-white/45">
          Loading workflow…
        </div>
      }
    >
      <PublicWorkflowTemplateInner templateId={templateId} />
    </Suspense>
  );
}
