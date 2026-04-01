"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQ_ITEMS = [
  {
    q: "What kind of products work best?",
    a: "Youry works with any e-commerce product: skincare, supplements, fashion, electronics, home goods, and more. If it has a product page, we can turn it into a video ad.",
  },
  {
    q: "Do I need to provide my own video footage?",
    a: "No! Youry generates everything from your product images and page content. Our AI creates the script, selects an avatar, and produces a complete video ad automatically.",
  },
  {
    q: "How long does it take to generate a video?",
    a: "Most videos are ready in under 5 minutes. Simply paste your URL, choose your style, and click generate.",
  },
  {
    q: "Can I customize the generated ads?",
    a: "Absolutely. You can adjust the script, change the avatar, modify the style template, and regenerate as many times as you want.",
  },
  {
    q: "What platforms are the videos optimized for?",
    a: "All videos are generated in 9:16 vertical format, optimized for TikTok, Instagram Reels, YouTube Shorts, and Facebook Stories.",
  },
] as const;

export function LandingFaq() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <section className="mx-auto max-w-3xl px-5 py-24">
      <div className="mb-12 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
          FAQ
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight">
          Frequently Asked Questions
        </h2>
      </div>

      <div className="space-y-3">
        {FAQ_ITEMS.map((item, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015] transition-colors hover:border-white/[0.1]"
          >
            <button
              type="button"
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left text-sm font-medium"
            >
              <span>{item.q}</span>
              <ChevronDown
                className={`ml-4 h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${
                  openFaq === i ? "rotate-180" : ""
                }`}
              />
            </button>
            <div
              className={`grid transition-all duration-200 ${
                openFaq === i
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-4 text-sm leading-relaxed text-white/45">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
