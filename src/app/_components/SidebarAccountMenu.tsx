"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, DollarSign, HelpCircle, LogOut, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  email: string;
  onLogout: () => void;
  planLabel?: string;
  /** Narrow sidebar: avatar trigger only. */
  collapsed?: boolean;
};

export default function SidebarAccountMenu({
  email,
  onLogout,
  planLabel = "Free",
  collapsed = false,
}: Props) {
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

  const display = email.trim() || "…";
  const truncated = display.length > 24 ? `${display.slice(0, 21)}…` : display;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          collapsed
            ? "flex w-full items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
            : "flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
        }
        aria-expanded={open}
        aria-haspopup="menu"
        title={collapsed ? `${display} · ${planLabel}` : undefined}
        aria-label={collapsed ? `Account: ${display}` : undefined}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500">
          <User className="h-3.5 w-3.5 text-white" strokeWidth={1.75} aria-hidden />
        </div>
        {collapsed ? null : (
          <>
            <div className="min-w-0 flex-1">
              <p className="select-text truncate text-xs font-semibold leading-tight text-white" title={display}>
                {truncated}
              </p>
              <p className="text-[10px] font-medium leading-tight text-violet-400">{planLabel}</p>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-white/45 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className={
            collapsed
              ? "absolute bottom-full left-0 z-[100] mb-2 w-[min(calc(100vw-1rem),14rem)] overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0f] py-1 shadow-[0_-12px_48px_rgba(0,0,0,0.65)]"
              : "absolute bottom-full left-0 right-0 z-[100] mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0f] py-1 shadow-[0_-12px_48px_rgba(0,0,0,0.65)]"
          }
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
            onClick={() => {
              setOpen(false);
              router.push("/subscription");
            }}
          >
            <Settings className="h-4 w-4 shrink-0 text-white/70" strokeWidth={1.75} />
            Subscription
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white/90 transition-colors hover:bg-white/[0.06]"
            onClick={() => {
              setOpen(false);
              router.push("/support");
            }}
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
