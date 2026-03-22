import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { CreditsPlanProvider } from "@/app/_components/CreditsPlanContext";
import { Toaster } from "@/components/ui/sonner";

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

const DATAFAST_WEBSITE_ID =
  process.env.NEXT_PUBLIC_DATAFAST_WEBSITE_ID ?? "dfid_CATofowr0YLBVK8sLAekT";
const DATAFAST_DOMAIN = process.env.NEXT_PUBLIC_DATAFAST_DOMAIN ?? "youry.io";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Datafast analytics; same as snippet in <head>; beforeInteractive injects early */}
      <Script
        id="datafast"
        src="https://datafa.st/js/script.js"
        strategy="beforeInteractive"
        data-website-id={DATAFAST_WEBSITE_ID}
        data-domain={DATAFAST_DOMAIN}
      />
      {/* LinkJolt affiliate tracking */}
      <Script
        id="linkjolt"
        src="https://www.linkjolt.io/api/tracking.js?id=NKdBH0Xt51wfjtEIZB5Zg"
        strategy="afterInteractive"
      />
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <CreditsPlanProvider>
          {children}
        </CreditsPlanProvider>
        <Toaster richColors />
      </body>
    </html>
  );
}
