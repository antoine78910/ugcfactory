import { Geist, Geist_Mono } from "next/font/google";

/** Same Geist stack as the marketing LP (`layout.tsx` body variables + class). */
export const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Root wrapper classes for `/`, `/careers`, `/manifesto`, and job pages. */
export const marketingPageRootClassName = [
  geistSans.className,
  "min-h-screen overflow-x-clip bg-[#050507] antialiased text-white selection:bg-violet-500/30",
].join(" ");
