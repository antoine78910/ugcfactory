import type { Metadata } from "next";

import StudioShell from "@/app/_components/StudioShell";

import { WorkflowSpacesLanding } from "./WorkflowSpacesLanding";

export const metadata: Metadata = {
  title: "Workflow | Youry",
  description: "Link images, videos, and variations to plan your ad workflows.",
};

export default function WorkflowPage() {
  return (
    <StudioShell>
      <WorkflowSpacesLanding />
    </StudioShell>
  );
}
