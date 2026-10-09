import type { Metadata } from "next";

import StudioShell from "@/app/_components/StudioShell";

import { WorkflowEditor } from "../../WorkflowEditor";

export const metadata: Metadata = {
  title: "Workflow | Youry",
  description: "Plan nodes, pages, and branches in your workflow.",
};

export default async function WorkflowSpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ share?: string; token?: string; page?: string }>;
}) {
  const { spaceId } = await params;
  const sp = await searchParams;
  const raw = (typeof sp.share === "string" && sp.share.trim() ? sp.share : sp.token)?.trim();
  const shareToken = raw || undefined;
  const initialPageId = typeof sp.page === "string" && sp.page.trim() ? sp.page.trim() : undefined;

  return (
    <StudioShell>
      <WorkflowEditor spaceId={spaceId} shareToken={shareToken} initialPageId={initialPageId} />
    </StudioShell>
  );
}
