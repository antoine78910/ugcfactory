"use client";

import { useEffect } from "react";
import {
  careersSessionMarkOnce,
  trackCareersEvent,
} from "@/lib/careers/trackClient";

export function JobPostingViewTracker({ jobSlug }: { jobSlug: string }) {
  useEffect(() => {
    if (!jobSlug) return;
    if (!careersSessionMarkOnce(`job_view_${jobSlug}`)) return;
    void trackCareersEvent("job_view", jobSlug);
  }, [jobSlug]);
  return null;
}
