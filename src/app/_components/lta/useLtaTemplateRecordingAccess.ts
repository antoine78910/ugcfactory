"use client";

import { useCallback, useEffect, useState } from "react";
import { isDefaultTemplateRecordingEmail } from "@/lib/ltaTemplateRecording";

/**
 * Whether the signed-in user may use Link to Ad template tools
 * (Template button in My Projects, template brand sync, etc.).
 */
export function useLtaTemplateRecordingAccess(clientEmail?: string | null) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(() => isDefaultTemplateRecordingEmail(clientEmail));

  const refresh = useCallback(async () => {
    if (isDefaultTemplateRecordingEmail(clientEmail)) {
      setEnabled(true);
    }

    try {
      const res = await fetch("/api/me/lta-template-recording", {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { enabled?: boolean };
      const fromApi = res.ok && Boolean(json.enabled);
      setEnabled(fromApi || isDefaultTemplateRecordingEmail(clientEmail));
    } catch {
      if (isDefaultTemplateRecordingEmail(clientEmail)) setEnabled(true);
    } finally {
      setReady(true);
    }
  }, [clientEmail]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { enabled, ready, refresh };
}
