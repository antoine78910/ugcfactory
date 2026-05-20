"use client";

import { useEffect } from "react";
import {
  careersSessionMarkOnce,
  trackCareersEvent,
} from "@/lib/careers/trackClient";

export function CareersLandingTracker() {
  useEffect(() => {
    if (!careersSessionMarkOnce("careers_landing")) return;
    void trackCareersEvent("careers_landing");
  }, []);
  return null;
}
