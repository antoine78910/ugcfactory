"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, DollarSign, HelpCircle, LogOut, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  email: string;
  onLogout: () => void;
  planLabel?: string;
};

export default function SidebarAccountMenu({ email, onLogout, planLabel = "Free" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const display = email.trim() || "—";
  const truncated = display.length > 24 ? `${display.slice(0, 21)}…` : display;

  function comingSoon(label: string) {
    toast.message(label, { description: "Coming soon." });
    setOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500">
          <User className="h-4 w-4 text-white" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white" title={display}>
            {truncated}
          </p>
          <p className="text-xs font-medium text-violet-400">{planLabel}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-white/45 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 z-[100] mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0f] py-1 shadow-[0_-12px_48px_rgba(0,0,0,0.65)]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white/90 transition-colors hover:bg-white/[0.06]"
            onClick={() => {
              setOpen(false);
              router.push("/credits");
            }}
          >
            <DollarSign className="h-4 w-4 shrink-0 text-white/70" strokeWidth={1.75} />
            Credits
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white/90 transition-colors hover:bg-white/[0.06]"
            onClick={() => comingSoon("Subscription")}
          >
            <Settings className="h-4 w-4 shrink-0 text-white/70" strokeWidth={1.75} />
            Subscription
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white/90 transition-colors hover:bg-white/[0.06]"
            onClick={() => comingSoon("Support")}
          >
            <HelpCircle className="h-4 w-4 shrink-0 text-white/70" strokeWidth={1.75} />
            Support
          </button>
          <div className="my-1 border-t border-white/10" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
