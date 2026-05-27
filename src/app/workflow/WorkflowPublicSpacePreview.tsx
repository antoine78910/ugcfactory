"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";

import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";

import { WorkflowFlowWorkspace } from "./WorkflowEditor";
import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import { defaultWorkflowProject } from "./workflowProjectStorage";
export function WorkflowPublicSpacePreview({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const sb = useSupabaseBrowserClient();
  const [authUserId, setAuthUserId] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [spaceName, setSpaceName] = useState("Workflow");
  const [project, setProject] = useState<WorkflowProjectStateV1>(() => defaultWorkflowProject());
  const [projectReady, setProjectReady] = useState(false);

  const hidePromptsForGuests = true;

  useEffect(() => {
    if (!sb) {
      setAuthUserId(null);
      return;
    }
    void sb.auth.getSession().then(({ data }) => {
      setAuthUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setAuthUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!token) {
      router.replace("/workflow");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setProjectReady(false);
    void (async () => {
      const qs = new URLSearchParams({ token, spaceId });
      const res = await fetch(`/api/workflow/share-preview?${qs}`, { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        router.replace("/workflow");
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        space?: { name?: string; state?: WorkflowProjectStateV1 };
      } | null;
      const snap = body?.space;
      if (!snap?.state || snap.state.v !== 1) {
        router.replace("/workflow");
        return;
      }
      setSpaceName(typeof snap.name === "string" && snap.name.trim() ? snap.name.trim() : "Workflow");
      setProject(snap.state);
      setProjectReady(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, spaceId, token]);

  const guestPromptGate = useMemo(
    () => hidePromptsForGuests && authUserId === null,
    [authUserId, hidePromptsForGuests],
  );

  const signupRedirect = `/workflow/public/space/${encodeURIComponent(spaceId)}?token=${encodeURIComponent(token)}`;

  if (loading || authUserId === undefined || !projectReady) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#06070d] text-sm text-white/45">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-violet-300" />
        Loading workflow…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] min-w-0 flex-col overflow-hidden bg-[#06070d] text-white">
      <header className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#06070d]/95 px-4 backdrop-blur-md sm:h-14 sm:px-5">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold sm:text-base">{spaceName}</h1>
          <p className="text-[11px] text-white/45">Public view</p>
        </div>
        {authUserId ? null : (
          <Link
            href={`/signup?redirect=${encodeURIComponent(signupRedirect)}`}
            className="shrink-0 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-zinc-900 shadow-sm hover:bg-white/95"
          >
            Sign up
          </Link>
        )}
      </header>
      {guestPromptGate ? (
        <p className="border-b border-violet-500/20 bg-violet-500/10 px-4 py-2 text-center text-[12px] text-violet-100/90">
          Prompts are hidden on this public link.{" "}
          <Link href={`/signup?redirect=${encodeURIComponent(signupRedirect)}`} className="font-semibold underline">
            Sign up
          </Link>{" "}
          to view prompts.
        </p>
      ) : null}
      <div className="relative z-10 min-h-0 flex-1">
        <ReactFlowProvider>
          <WorkflowFlowWorkspace
            project={project}
            setProject={setProject}
            readOnly
            hidePromptsForGuests={guestPromptGate}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
