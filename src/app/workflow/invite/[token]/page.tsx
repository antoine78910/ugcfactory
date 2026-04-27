"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  LogIn,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";
import { storeInviteWelcome } from "../../WorkflowInviteWelcome";
import {
  createSpace,
  getWorkflowStorageScope,
  saveProjectForSpace,
} from "../../workflowSpacesStorage";
import { fetchCloudWorkflowSpace } from "../../workflowSpacesCloud";

type InviteInfo = {
  spaceId: string;
  permission: string;
  invitedBy: string;
  expired: boolean;
};

type AcceptResult = {
  spaceId: string;
  role: string;
  alreadyMember: boolean;
  invitedBy?: string;
};

export default function WorkflowInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";

  const supabase = useSupabaseBrowserClient();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState<AcceptResult | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setUserId(null);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/workflow/invite?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.error || "Invalid or expired invite link");
          return;
        }
        const d = await res.json();
        if (d.expired) {
          setError("This invite link has expired");
          return;
        }
        setInfo(d);
      })
      .catch(() => setError("Could not verify invite"));
  }, [token]);

  const accept = useCallback(async () => {
    if (!token) return;
    setAccepting(true);
    try {
      const res = await fetch("/api/workflow/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Could not accept invite");
        return;
      }
      const d = (await res.json()) as AcceptResult;
      setAccepted(d);
      if (d.alreadyMember) {
        toast.info("You already have access to this space");
      } else {
        toast.success("You've joined the workspace!");
        storeInviteWelcome({
          invitedBy: d.invitedBy ?? info?.invitedBy ?? "A collaborator",
          spaceId: d.spaceId,
          role: d.role,
        });
      }
    } catch {
      toast.error("Network error");
    } finally {
      setAccepting(false);
    }
  }, [token]);

  const duplicateAsTemplateCopy = useCallback(async () => {
    if (!accepted || !userId) return;
    setDuplicating(true);
    try {
      const source = await fetchCloudWorkflowSpace(accepted.spaceId);
      if (!source?.state) {
        toast.error("Could not load shared workflow content.");
        return;
      }
      const scope = getWorkflowStorageScope(userId);
      const sharedBy = (accepted.invitedBy ?? info?.invitedBy ?? "shared").trim();
      const copyName = `${source.name || "Shared workflow"} (from ${sharedBy})`;
      const meta = createSpace(scope, copyName);
      saveProjectForSpace(scope, meta.id, source.state);
      toast.success("Template copy created in your workflows.");
      router.push(`/workflow/space/${encodeURIComponent(meta.id)}`);
    } catch {
      toast.error("Could not create a template copy.");
    } finally {
      setDuplicating(false);
    }
  }, [accepted, userId, router, info]);

  useEffect(() => {
    if (userId === null && info) {
      const returnUrl = `/workflow/invite/${token}`;
      sessionStorage.setItem("workflow-invite-return", returnUrl);
    }
  }, [userId, info, token]);

  useEffect(() => {
    if (userId && info && !accepted && !accepting && !error) {
      accept();
    }
  }, [userId, info, accepted, accepting, error, accept]);

  if (error) {
    return (
      <InviteShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <XCircle className="h-12 w-12 text-red-400/80" />
          <h1 className="text-lg font-semibold text-white">Invite not valid</h1>
          <p className="max-w-xs text-[14px] leading-relaxed text-white/55">{error}</p>
          <Link
            href="/workflow"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-violet-500 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-violet-400"
          >
            Go to Workflow
          </Link>
        </div>
      </InviteShell>
    );
  }

  if (userId === undefined || !info) {
    return (
      <InviteShell>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400/60" />
          <p className="text-[14px] text-white/50">Loading invite…</p>
        </div>
      </InviteShell>
    );
  }

  if (userId === null) {
    const signupUrl = `/signup?redirect=${encodeURIComponent(`/workflow/invite/${token}`)}`;
    const signinUrl = `/signin?redirect=${encodeURIComponent(`/workflow/invite/${token}`)}`;

    return (
      <InviteShell>
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/15">
            <Users className="h-8 w-8 text-violet-300" />
          </div>
          <h1 className="text-lg font-semibold text-white">You&apos;re invited!</h1>
          <p className="max-w-xs text-[14px] leading-relaxed text-white/55">
            <span className="font-medium text-white/80">{info.invitedBy}</span> invited you
            to collaborate on a workflow space
            {info.permission === "editor" ? " with editing access" : " as a viewer"}.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Link
              href={signupUrl}
              className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-violet-400"
            >
              <Sparkles className="h-4 w-4" />
              Create an account
            </Link>
            <Link
              href={signinUrl}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-[13px] font-semibold text-white/80 transition hover:bg-white/10"
            >
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          </div>
        </div>
      </InviteShell>
    );
  }

  if (accepting) {
    return (
      <InviteShell>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400/60" />
          <p className="text-[14px] text-white/50">Joining workspace…</p>
        </div>
      </InviteShell>
    );
  }

  if (accepted) {
    return (
      <InviteShell>
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15">
            <Check className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">
            {accepted.alreadyMember ? "You already have access" : "You've joined!"}
          </h1>
          <p className="max-w-xs text-[14px] leading-relaxed text-white/55">
            {accepted.alreadyMember
              ? "You're already a collaborator on this space."
              : `${accepted.invitedBy ?? "A collaborator"} invited you to this workflow space. ${accepted.role === "editor" ? "You can view and edit it." : "Viewer access opens it as a template source; duplicate it to keep your own editable copy."}`}
          </p>
          {accepted.role === "editor" ? (
            <button
              type="button"
              onClick={() =>
                router.push(`/workflow/space/${encodeURIComponent(accepted.spaceId)}`)
              }
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-violet-500 px-6 py-2.5 text-[13px] font-semibold text-white transition hover:bg-violet-400"
            >
              <ExternalLink className="h-4 w-4" />
              Open workspace
            </button>
          ) : (
            <button
              type="button"
              disabled={duplicating}
              onClick={() => void duplicateAsTemplateCopy()}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-violet-500 px-6 py-2.5 text-[13px] font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              {duplicating ? "Creating copy…" : "Duplicate as template copy"}
            </button>
          )}
        </div>
      </InviteShell>
    );
  }

  return null;
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#050507] px-4">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0912]/95 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop-blur-md">
        {children}
      </div>
    </div>
  );
}
