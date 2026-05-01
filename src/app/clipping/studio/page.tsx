import type { Metadata } from "next";
import { Suspense } from "react";
import ClippingStudio from "../ClippingStudio";

export const metadata: Metadata = {
  title: "Clipping Studio",
  description: "Record a hook and a split-screen template clip in one take.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ClippingStudioPage() {
  return (
    <Suspense fallback={null}>
      <ClippingStudio />
    </Suspense>
  );
}
