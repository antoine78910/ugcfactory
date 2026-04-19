"use client";

import { Dialog } from "radix-ui";
import { Sparkles, Users } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "workflow-invite-welcome";

type InviteWelcomePayload = {
  invitedBy: string;
  spaceId: string;
  role: string;
};

export function storeInviteWelcome(payload: InviteWelcomePayload) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function WorkflowInviteWelcome({ spaceId }: { spaceId: string }) {
  const [payload, setPayload] = useState<InviteWelcomePayload | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as InviteWelcomePayload;
      if (parsed.spaceId !== spaceId) return;
      sessionStorage.removeItem(STORAGE_KEY);
      setPayload(parsed);
      setOpen(true);
    } catch {
      /* ignore */
    }
  }, [spaceId]);

  if (!payload) return null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[251] w-[min(88vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/12 bg-[#0b0912] p-8 text-center shadow-[0_32px_100px_rgba(0,0,0,0.8)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <div className="mb-5 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/15 shadow-[0_0_40px_rgba(139,92,246,0.25)]">
              <Users className="h-8 w-8 text-violet-300" />
            </div>
          </div>

          <Dialog.Title className="mb-2 text-[17px] font-semibold text-white">
            Welcome to the workspace!
          </Dialog.Title>

          <p className="mb-6 text-[14px] leading-relaxed text-white/55">
            <span className="font-medium text-white/80">{payload.invitedBy}</span> invited you to
            collaborate on this workflow project
            {payload.role === "editor" ? ", you can view and edit" : ", you have view access"}.
          </p>

          <Dialog.Close asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-6 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-violet-400"
            >
              <Sparkles className="h-4 w-4" />
              Got it, let&apos;s go!
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
