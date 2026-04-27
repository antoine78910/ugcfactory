import type { Metadata } from "next";
import { Suspense } from "react";
import ClippingStudio from "./ClippingStudio";

/**
 * Hidden / unlisted clipping tool. There is no link to this page anywhere in
 * the app navigation on purpose: it is shared with clippers via a direct URL
 * (`/clipping?id=<token>`). The `id` is passed straight to the studio for
 * future template / analytics hooks.
 */
export const metadata: Metadata = {
  title: "Clipping Studio",
  description: "Record a hook and a split-screen template clip in one take.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ClippingPage() {
  return (
    <Suspense fallback={null}>
      <ClippingStudio />
    </Suspense>
  );
}
