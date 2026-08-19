"use client";

import { useEffect, useState } from "react";

import { getWorkflowLocalMedia, isWorkflowIdbMediaUrl } from "./workflowLocalMedia";

/** Resolve `idb:` pointers to blob URLs for <img>/<video>. HTTPS/blob/data URLs pass through. */
export function useWorkflowMediaSrc(url: string | null | undefined): string {
  const [src, setSrc] = useState(() => {
    const t = typeof url === "string" ? url.trim() : "";
    if (!t || isWorkflowIdbMediaUrl(t)) return "";
    return t;
  });

  useEffect(() => {
    const t = typeof url === "string" ? url.trim() : "";
    if (!t) {
      setSrc("");
      return;
    }
    if (!isWorkflowIdbMediaUrl(t)) {
      setSrc(t);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void getWorkflowLocalMedia(t)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return src;
}
