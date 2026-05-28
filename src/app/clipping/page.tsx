import type { Metadata } from "next";

import { ClippingLandingPage } from "./_components/ClippingLandingPage";

export const metadata: Metadata = {
  title: "Clipping Program — Earn with Youry",
  description:
    "Join the Youry clipping program. Create short-form content with Clipping Studio, Link to Ad templates, and pro workflows — in 30 minutes a day.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Clipping Program — Earn with Youry",
    description:
      "Film hooks, study winning ads, and scale your accounts with Youry clipping tools.",
  },
};

export default function ClippingPage() {
  return <ClippingLandingPage />;
}
