"use client";

import { Dialog } from "radix-ui";
import {
  Check,
  ChevronDown,
  Copy,
  Crown,
  Loader2,
  Pencil,
  Trash2,
  Eye,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Permission = "viewer" | "editor";

type Collaborator = {
  id: string;
  userId: string;
  role: string;
  email: string | null;
  name: string | null;
  isYou: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceName: string;
};

export function ShareWorkflowDialog({ open, onOpenChange, spaceId, spaceName }: Props) {
  const [permission, setPermission] = useState<Permission>("viewer");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [yourRole, setYourRole] = useState<string | null>(null);
  const [loadingCollabs, setLoadingCollabs] = useState(false);
  const [permDropdownOpen, setPermDropdownOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [collabFetchError, setCollabFetchError] = useState<"signin" | "other" | null>(null);

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => {
      const u = data.user;
      setUserId(u?.id ?? null);
      setSessionEmail(u?.email ?? null);
      const fn =
        typeof u?.user_metadata?.first_name === "string" ? u.user_metadata.first_name.trim() : "";
      setSessionName(fn || null);
    });
  }, []);

  const isOwner = useMemo(() => Boolean(userId && yourRole === "owner"), [userId, yourRole]);

  const fetchCollaborators = useCallback(async () => {
    setLoadingCollabs(true);
    setCollabFetchError(null);
    try {
      const res = await fetch(`/api/workflow/collaborators?spaceId=${encodeURIComponent(spaceId)}`);
      if (res.status === 401) {
        setCollaborators([]);
        setYourRole(null);
        setCollabFetchError("signin");
        return;
      }
      if (!res.ok) {
        setCollaborators([]);
        setYourRole(null);
        setCollabFetchError("other");
        return;
      }
      const data = await res.json();
      setCollaborators(data.collaborators ?? []);
      setYourRole(data.yourRole ?? null);
    } catch {
      setCollaborators([]);
      setYourRole(null);
      setCollabFetchError("other");
    } finally {
      setLoadingCollabs(false);
    }
  }, [spaceId]);

  useEffect(() => {
    if (open) {
      fetchCollaborators();
      setInviteUrl(null);
      setCopied(false);
    }
  }, [open, fetchCollaborators]);

  const generateLink = useCallback(async () => {
    setGenerating(true);
    setCopied(false);
    try {
      const res = await fetch("/api/workflow/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, permission }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not generate invite link");
        return;
      }
      const data = await res.json();
      setInviteUrl(data.inviteUrl);
    } catch {
      toast.error("Network error");
    } finally {
      setGenerating(false);
    }
  }, [spaceId, permission]);

  useEffect(() => {
    if (open && isOwner && !loadingCollabs && !inviteUrl) {
      generateLink();
    }
  }, [open, isOwner, loadingCollabs, permission, inviteUrl, generateLink]);

  const handlePermissionChange = useCallback(
    (p: Permission) => {
      setPermission(p);
      setPermDropdownOpen(false);
      setInviteUrl(null);
      setCopied(false);
    },
    [],
  );

  const copyLink = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy link");
    }
  }, [inviteUrl]);

  const updateCollabRole = useCallback(
    async (targetUserId: string, role: Permission) => {
      try {
        const res = await fetch("/api/workflow/collaborators", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId, userId: targetUserId, action: "set-role", role }),
        });
        if (res.ok) {
          setCollaborators((prev) =>
            prev.map((c) => (c.userId === targetUserId ? { ...c, role } : c)),
          );
          toast.success("Role updated");
        }
      } catch {
        toast.error("Could not update role");
      }
    },
    [spaceId],
  );

  const removeCollab = useCallback(
    async (targetUserId: string) => {
      try {
        const res = await fetch("/api/workflow/collaborators", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId, userId: targetUserId, action: "remove" }),
        });
        if (res.ok) {
          setCollaborators((prev) => prev.filter((c) => c.userId !== targetUserId));
          toast.success("Collaborator removed");
        }
      } catch {
        toast.error("Could not remove collaborator");
      }
    },
    [spaceId],
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/75 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[221] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/12 bg-[#101014] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="mb-1 flex items-center justify-between">
            <Dialog.Title className="text-[15px] font-semibold tracking-tight text-white">
              Share this space
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <p className="mb-2 text-[13px] leading-relaxed text-white/50">
            To collaborate in a space, you can use shared projects with a Teams plan or invite
            others with an invite link.
          </p>
          <p className="mb-5 text-[12px] text-white/40">
            Workspace: <span className="font-medium text-white/70">{spaceName}</span>
          </p>

          {collabFetchError === "signin" ? (
            <p className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100/90">
              Sign in to share this workspace and manage who has access.
            </p>
          ) : null}

          {userId && isOwner ? (
            <div className="mb-6 flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-0 rounded-full border border-white/12 bg-white/[0.04]">
                <div className="min-w-0 flex-1 truncate px-4 py-2.5 text-[13px] text-white/55">
                  {inviteUrl ?? "Generating link…"}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPermDropdownOpen((o) => !o)}
                    className="inline-flex items-center gap-1 whitespace-nowrap border-l border-white/10 px-3 py-2.5 text-[13px] font-medium text-white/75 transition hover:text-white"
                  >
                    {permission === "viewer" ? "Can view" : "Can edit"}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </button>

                  {permDropdownOpen ? (
                    <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-white/12 bg-[#1a1824] py-1 shadow-xl">
                      <button
                        type="button"
                        onClick={() => handlePermissionChange("viewer")}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-[13px] transition hover:bg-white/[0.06]",
                          permission === "viewer" ? "text-white" : "text-white/65",
                        )}
                      >
                        {permission === "viewer" && <Check className="h-3.5 w-3.5 text-violet-400" />}
                        <Eye className={cn("h-3.5 w-3.5", permission !== "viewer" && "ml-5")} />
                        Can view
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePermissionChange("editor")}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-[13px] transition hover:bg-white/[0.06]",
                          permission === "editor" ? "text-white" : "text-white/65",
                        )}
                      >
                        {permission === "editor" && <Check className="h-3.5 w-3.5 text-violet-400" />}
                        <Pencil className={cn("h-3.5 w-3.5", permission !== "editor" && "ml-5")} />
                        Can edit
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                disabled={!inviteUrl || generating}
                onClick={copyLink}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-semibold shadow-sm transition",
                  copied
                    ? "bg-emerald-500 text-white"
                    : "bg-violet-500 text-white hover:bg-violet-400",
                  (!inviteUrl || generating) && "cursor-not-allowed opacity-60",
                )}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied!" : "Copy invite link"}
              </button>
            </div>
          ) : userId ? (
            <p className="mb-6 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-[13px] text-white/45">
              Only the space owner can generate invite links.
            </p>
          ) : null}

          <div className="mb-3 text-[13px] font-semibold text-white/65">People with access</div>

          {loadingCollabs ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-white/30" />
            </div>
          ) : collabFetchError === "signin" ? null : collaborators.length === 0 ? (
            <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-4 text-[13px] text-white/40">
              {collabFetchError === "other"
                ? "Could not load people with access. Try again."
                : isOwner
                  ? "Loading your access… If this persists, refresh the page."
                  : "No collaborators listed yet."}
            </div>
          ) : (
            <div className="max-h-[min(35vh,280px)] overflow-y-auto rounded-xl border border-white/8 bg-white/[0.02]">
              {collaborators.map((c) => (
                <CollaboratorRow
                  key={c.id}
                  collab={c}
                  sessionFallbackName={c.isYou ? sessionName : null}
                  sessionFallbackEmail={c.isYou ? sessionEmail : null}
                  isOwner={isOwner}
                  onChangeRole={(role) => updateCollabRole(c.userId, role)}
                  onRemove={() => removeCollab(c.userId)}
                />
              ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CollaboratorRow({
  collab,
  sessionFallbackName,
  sessionFallbackEmail,
  isOwner,
  onChangeRole,
  onRemove,
}: {
  collab: Collaborator;
  sessionFallbackName: string | null;
  sessionFallbackEmail: string | null;
  isOwner: boolean;
  onChangeRole: (role: Permission) => void;
  onRemove: () => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const email = collab.email ?? sessionFallbackEmail;
  const displayName =
    collab.name?.trim() ||
    sessionFallbackName?.trim() ||
    email?.split("@")[0] ||
    "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-b-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[12px] font-bold text-violet-300">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-white/85">
          <span className="truncate">{displayName}</span>
          {collab.isYou && (
            <span className="shrink-0 text-[11px] text-white/35">(you)</span>
          )}
        </div>
        {email ? (
          <div className="truncate text-[12px] text-white/40">{email}</div>
        ) : null}
      </div>

      {collab.role === "owner" ? (
        <div className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-amber-300/80">
          <Crown className="h-3.5 w-3.5" />
          Owner
        </div>
      ) : isOwner && !collab.isYou ? (
        <div className="relative flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/65 transition hover:bg-white/[0.08]"
          >
            {collab.role === "editor" ? "Can edit" : "Can view"}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>

          {dropdownOpen ? (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[130px] overflow-hidden rounded-xl border border-white/12 bg-[#1a1824] py-1 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  onChangeRole("viewer");
                  setDropdownOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.06]"
              >
                <Eye className="h-3.5 w-3.5" /> Can view
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeRole("editor");
                  setDropdownOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.06]"
              >
                <Pencil className="h-3.5 w-3.5" /> Can edit
              </button>
              <div className="my-0.5 h-px bg-white/8" />
              <button
                type="button"
                onClick={() => {
                  onRemove();
                  setDropdownOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="shrink-0 text-[12px] text-white/40">
          {collab.role === "editor" ? "Can edit" : "Can view"}
        </div>
      )}
    </div>
  );
}
