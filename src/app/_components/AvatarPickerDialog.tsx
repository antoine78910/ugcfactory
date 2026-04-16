"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avatarUrls: string[];
  onPick: (url: string) => void;
  title?: string;
};

export function AvatarPickerDialog({
  open,
  onOpenChange,
  avatarUrls,
  onPick,
  title = "Choose your avatar",
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[520] bg-black/75 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[521] w-[min(92vw,620px)] max-h-[min(88vh,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/12 bg-[#101014] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.75)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold tracking-tight text-white">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
                aria-label="Close avatar picker"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {avatarUrls.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {avatarUrls.map((url, idx) => (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => {
                    onPick(url);
                    onOpenChange(false);
                  }}
                  className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-white/15 bg-black/30 transition hover:border-violet-400/55"
                  title="Use this avatar"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Avatar ${idx + 1}`} className="h-full w-full object-cover" />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2 text-[10px] font-medium text-white/85 opacity-0 transition group-hover:opacity-100">
                    Select
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-white/55">
              No avatars in your library yet. Open{" "}
              <span className="font-medium text-white/75">Create → Avatar</span> in the app, generate an avatar, then
              come back here — or refresh after saving.
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                Close
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

