import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { CreditsPlanProvider } from "@/app/_components/CreditsPlanContext";
import { Toaster } from "@/components/ui/sonner";
import HeyoInit from "@/app/_components/HeyoInit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Youry | Turn Any Product Into A Video Ad",
  description: "Turn any product into realistic AI ads, UGC, reels and stories.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

/** Lets `env(safe-area-inset-*)` work on notched phones (auth, studio footers). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const DATAFAST_WEBSITE_ID =
  process.env.NEXT_PUBLIC_DATAFAST_WEBSITE_ID ?? "dfid_CATofowr0YLBVK8sLAekT";
const DATAFAST_DOMAIN = process.env.NEXT_PUBLIC_DATAFAST_DOMAIN ?? "youry.io";
const LINKJOLT_MERCHANT_ID =
  process.env.NEXT_PUBLIC_LINKJOLT_MERCHANT_ID ?? "NKdBH0Xt51wfjtEIZB5Zg";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    // Not authenticated or Supabase unavailable — credits context will use anonymous keys.
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Scripts must live inside <body> — direct children of <html> are invalid and cause React hydration #418 */}
        {/* afterInteractive: avoids blocking first paint / main thread vs beforeInteractive */}
        <Script
          id="datafast"
          src="https://datafa.st/js/script.js"
          strategy="afterInteractive"
          data-website-id={DATAFAST_WEBSITE_ID}
          data-domain={DATAFAST_DOMAIN}
        />
        <Script
          id="linkjolt"
          src={`https://www.linkjolt.io/api/tracking.js?id=${LINKJOLT_MERCHANT_ID}`}
          strategy="afterInteractive"
        />
        <CreditsPlanProvider userId={userId}>
          <HeyoInit />
          {children}
        </CreditsPlanProvider>
        <Toaster richColors />
      </body>
    </html>
  );
}

