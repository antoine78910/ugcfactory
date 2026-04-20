"use client";

import { useEffect } from "react";
import { loadOnFirstInteraction } from "./loadOnFirstInteraction";

/**
 * Live-chat widget. Heavy: ~270 KiB script + 134 KiB avatar PNG (uncached, served
 * by cdn.heyo.so). User cannot benefit from chat before they at least look at the
 * page, so we delay the bootstrap to first user interaction (pointer / scroll /
 * keydown), with a 15s fallback so passive readers still get the widget.
 */
export default function HeyoInit() {
  useEffect(() => {
    let canceled = false;
    const boot = async () => {
      if (canceled) return;
      try {
        const { default: HEYO } = await import("@heyo.so/js");
        if (canceled) return;
        HEYO.init({ projectId: "69c150e9ace32ad739854923" });
      } catch {
        /* ignore: widget bootstrap is best-effort */
      }
    };

    const cleanup = loadOnFirstInteraction(() => void boot(), { fallbackMs: 15_000 });
    return () => {
      canceled = true;
      cleanup();
    };
  }, []);

  return null;
}

