import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { CreditsPlanProvider } from "@/app/_components/CreditsPlanContext";
import { StudioAccessGuard } from "@/app/_components/StudioAccessGuard";
import { BrowserSupabaseProvider } from "@/lib/supabase/BrowserSupabaseProvider";
import { Toaster } from "@/components/ui/sonner";
import HeyoInit from "@/app/_components/HeyoInit";
import ClarityInit from "@/app/_components/ClarityInit";
import { RedeemTokenGuard } from "@/app/_components/RedeemTokenGuard";
import { DubAnalyticsInit } from "@/app/_components/DubAnalyticsInit";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const defaultTitle = "Youry | Turn Any Product Into A Video Ad";
const defaultDescription =
  "Turn any product into realistic AI ads, UGC, reels and stories.";

/** Absolute base URL for Open Graph / Twitter cards (Discord, Slack, etc.). */
function metadataBaseUrl(): URL {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.APP_URL?.trim(),
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    process.env.VERCEL_URL?.trim()
      ? `https://${process.env.VERCEL_URL.trim()}`
      : "",
  ].filter(Boolean) as string[];
  for (const raw of candidates) {
    const s = raw.replace(/\/+$/, "");
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    try {
      return new URL(withScheme);
    } catch {
      /* try next */
    }
  }
  return new URL("https://app.youry.io");
}

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  title: defaultTitle,
  description: defaultDescription,
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Youry",
    locale: "en_US",
    title: defaultTitle,
    description: defaultDescription,
    images: [
      {
        url: "/og-banner.png",
        width: 1200,
        height: 630,
        alt: "Youry, product to video ads",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: ["/og-banner.png"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Preconnect to cross-origin endpoints we hit very early:
          - app.youry.io: every CTA on the LP navigates here (signin/signup)
          - dubcdn.com:   first-party analytics script (`Dub`)
          - datafa.st:    `<Script>` already uses lazyOnload but preconnect saves one RTT
        */}
        <link rel="preconnect" href="https://app.youry.io" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.dubcdn.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://datafa.st" />
      </head>
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
        {/* Dub script early so `window.dubAnalytics` exists before auth and other client code runs. */}
        <DubAnalyticsInit />
        <BrowserSupabaseProvider>
          <CreditsPlanProvider>
            <StudioAccessGuard />
            <RedeemTokenGuard />
            <HeyoInit />
            <ClarityInit />
            {children}
          </CreditsPlanProvider>
        </BrowserSupabaseProvider>
        <Toaster richColors />
      </body>
    </html>
  );
}

