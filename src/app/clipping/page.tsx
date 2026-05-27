import type { Metadata } from "next";
import { Suspense } from "react";

import { ClippingToolsHub } from "./_components/ClippingToolsHub";

export const metadata: Metadata = {
  title: "Clipping Tools",
  description: "Access clipping tools, templates, link-to-ad references and workflows.",
  robots: { index: false, follow: false },
};

export default function ClippingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#06050a] text-sm text-white/45">
          Loading clipping tools…
        </div>
      }
    >
      <ClippingToolsHub />
    </Suspense>
  );
}
