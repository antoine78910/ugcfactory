import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkflowPublicSpacePreview } from "@/app/workflow/WorkflowPublicSpacePreview";

export const metadata: Metadata = {
  title: "Shared workflow | Youry",
  description: "View a shared workflow.",
  robots: { index: false, follow: false },
};

export default async function WorkflowPublicSpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#06070d] text-sm text-white/45">
          Loading workflow…
        </div>
      }
    >
      <WorkflowPublicSpacePreview spaceId={spaceId} />
    </Suspense>
  );
}
