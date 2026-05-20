"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  careersSessionMarkOnce,
  trackCareersEvent,
} from "@/lib/careers/trackClient";

type TabId = "overview" | "application";

export function JobPostingTabs({
  overview,
  application,
  jobSlug,
  initialTab = "overview",
}: {
  overview: ReactNode;
  application: ReactNode;
  /** When the user lands with ?tab=application */
  initialTab?: TabId;
  /** If set, we record funnel events when the Application tab is opened */
  jobSlug?: string;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (tab !== "application" || !jobSlug) return;
    if (!careersSessionMarkOnce(`application_tab_${jobSlug}`)) return;
    void trackCareersEvent("application_tab_view", jobSlug);
  }, [tab, jobSlug]);

  const onKeyDown = useCallback((e: React.KeyboardEvent, id: TabId) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setTab(id);
    }
  }, []);

  return (
    <div>
      <div
        className="mb-8 flex gap-0 overflow-x-auto border-b border-border"
        role="tablist"
        aria-label="Job posting sections"
      >
        <button
          type="button"
          role="tab"
          id="job-overview"
          aria-selected={tab === "overview"}
          aria-controls="overview-panel"
          tabIndex={tab === "overview" ? 0 : -1}
          onClick={() => setTab("overview")}
          onKeyDown={(e) => onKeyDown(e, "overview")}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
            tab === "overview"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          id="job-application-form"
          aria-selected={tab === "application"}
          aria-controls="application-panel"
          tabIndex={tab === "application" ? 0 : -1}
          onClick={() => setTab("application")}
          onKeyDown={(e) => onKeyDown(e, "application")}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
            tab === "application"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Application
        </button>
      </div>

      <div
        id="overview-panel"
        role="tabpanel"
        aria-labelledby="job-overview"
        hidden={tab !== "overview"}
        tabIndex={0}
        className="outline-none"
      >
        {overview}
      </div>
      <div
        id="application-panel"
        role="tabpanel"
        aria-labelledby="job-application-form"
        hidden={tab !== "application"}
        tabIndex={0}
        className="outline-none"
      >
        {application}
      </div>
    </div>
  );
}
