"use client";

import { useEffect } from "react";
import HEYO from "@heyo.so/js";

export default function HeyoInit() {
  useEffect(() => {
    let canceled = false;
    const run = () => {
      if (canceled) return;
      try {
        HEYO.init({ projectId: "69c150e9ace32ad739854923" });
      } catch {
        /* ignore */
      }
    };

    let idleId: number | undefined;
    let timeoutId: number | undefined;

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, { timeout: 8000 });
    } else {
      timeoutId = window.setTimeout(run, 3500) as number;
    }

    return () => {
      canceled = true;
      if (idleId !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}

