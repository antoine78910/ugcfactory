"use client";

import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";

/**
 * Server-backed counterpart to {@link workflowSpacesStorage}.
 *
 * Workflows are still authored against localStorage for snappy UX, but a copy
 * of the project state is mirrored to Supabase so that:
 *
 *  - sharing actually works (invitees can load the workflow on their own
 *    device after accepting the invite),
 *  - the same account can resume work from a different browser / machine.
 *
 * All helpers here gracefully no-op when the user is not signed in or the
 * server returns an error; callers should treat them as best-effort.
 */
export type CloudWorkflowSpace = {
  id: string;
  name: string;
  previewDataUrl: string | null;
  publishedCommunityTemplateId: string | null;
  updatedAt: string;
  role: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  isOwn: boolean;
};

export type CloudWorkflowSpaceFull = {
  id: string;
  name: string;
  state: WorkflowProjectStateV1;
  previewDataUrl: string | null;
  publishedCommunityTemplateId: string | null;
  updatedAt: string;
  ownerId: string | null;
  role: string;
  isOwn: boolean;
};

export async function listCloudWorkflowSpaces(): Promise<CloudWorkflowSpace[]> {
  try {
    const res = await fetch(`/api/workflow/spaces?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { spaces?: CloudWorkflowSpace[] };
    return Array.isArray(j.spaces) ? j.spaces : [];
  } catch {
    return [];
  }
}

export async function fetchCloudWorkflowSpace(
  spaceId: string,
): Promise<CloudWorkflowSpaceFull | null> {
  try {
    const res = await fetch(
      `/api/workflow/spaces/${encodeURIComponent(spaceId)}?t=${Date.now()}`,
      { method: "GET", cache: "no-store" },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { space?: CloudWorkflowSpaceFull };
    return j.space ?? null;
  } catch {
    return null;
  }
}

export async function saveCloudWorkflowSpace(input: {
  spaceId: string;
  name: string;
  state: WorkflowProjectStateV1;
  previewDataUrl?: string | null;
  publishedCommunityTemplateId?: string | null;
}): Promise<{ ok: boolean; role?: string; status?: number; error?: string }> {
  try {
    const res = await fetch(
      `/api/workflow/spaces/${encodeURIComponent(input.spaceId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          name: input.name,
          state: input.state,
          previewDataUrl: input.previewDataUrl ?? null,
          publishedCommunityTemplateId: input.publishedCommunityTemplateId ?? null,
        }),
      },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, status: res.status, error: j?.error };
    }
    const j = (await res.json().catch(() => ({}))) as { role?: string };
    return { ok: true, role: j.role };
  } catch {
    return { ok: false };
  }
}

export async function deleteCloudWorkflowSpace(spaceId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/workflow/spaces/${encodeURIComponent(spaceId)}`,
      { method: "DELETE", cache: "no-store" },
    );
    return res.ok;
  } catch {
    return false;
  }
}
