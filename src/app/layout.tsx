import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { CreditsPlanProvider } from "@/app/_components/CreditsPlanContext";
import { Toaster } from "@/components/ui/sonner";
import HeyoInit from "@/app/_components/HeyoInit";
import ClarityInit from "@/app/_components/ClarityInit";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* DataFast: queue guarantees events fire even before the main script loads */}
        <Script
          id="datafast-queue"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.datafast=window.datafast||function(){window.datafast.q=window.datafast.q||[];window.datafast.q.push(arguments);};`,
          }}
        />
        <Script
          id="datafast"
          src="https://datafa.st/js/script.js"
          strategy="lazyOnload"
          data-website-id={DATAFAST_WEBSITE_ID}
          data-domain={DATAFAST_DOMAIN}
        />
        <Script
          id="linkjolt"
          src={`https://www.linkjolt.io/api/tracking.js?id=${LINKJOLT_MERCHANT_ID}`}
          strategy="lazyOnload"
        />
        <CreditsPlanProvider>
          <HeyoInit />
          <ClarityInit />
          {children}
        </CreditsPlanProvider>
        <Toaster richColors />
      </body>
    </html>
  );
}

