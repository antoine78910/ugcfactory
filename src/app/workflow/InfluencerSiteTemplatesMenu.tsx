"use client";

import { Check, LayoutTemplate, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CREATOR_PRODUCT_TEMPLATES,
  type CreatorProductTemplate,
} from "@/lib/creatorProductTemplates";
import { isInfluencerAccount } from "@/lib/influencerAccounts";
import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";
import { cn } from "@/lib/utils";

export function InfluencerSiteTemplatesMenu({
  title = "Static ads",
  hint = "Start a new static ad workflow from a product.",
  onSelect,
}: {
  title?: string;
  hint?: string;
  onSelect?: (template: CreatorProductTemplate) => void;
}) {
  const sb = useSupabaseBrowserClient();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(CREATOR_PRODUCT_TEMPLATES[0].id);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const openingLock = useRef(false);

  useEffect(() => {
    if (!sb) return;
    let cancelled = false;
    void sb.auth.getSession().then(({ data }) => {
      if (!cancelled) setVisible(isInfluencerAccount(data.session?.user));
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setVisible(isInfluencerAccount(session?.user));
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!visible) return null;

  const selected = CREATOR_PRODUCT_TEMPLATES.find((t) => t.id === selectedId) ?? CREATOR_PRODUCT_TEMPLATES[0];

  const openSharedWorkflow = (template: CreatorProductTemplate) => {
    if (onSelect) {
      setSelectedId(template.id);
      onSelect(template);
      return;
    }
    if (openingLock.current) return;
    openingLock.current = true;
    setSelectedId(template.id);
    setOpeningId(template.id);
    void (async () => {
      try {
        const res = await fetch("/api/workflow/influencer-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: template.id }),
        });
        const body = (await res.json().catch(() => null)) as { spaceId?: string; error?: string } | null;
        if (!res.ok || !body?.spaceId) {
          toast.error(body?.error || "Could not open this template.");
          openingLock.current = false;
          setOpeningId(null);
          return;
        }
        setOpen(false);
        const href = `/workflow/space/${encodeURIComponent(body.spaceId)}`;
        router.push(href);
        window.setTimeout(() => {
          if (!window.location.pathname.includes(`/workflow/space/${body.spaceId}`)) {
            window.location.assign(href);
          }
        }, 700);
        openingLock.current = false;
        setOpeningId(null);
      } catch {
        toast.error("Could not open this template.");
        openingLock.current = false;
        setOpeningId(null);
      }
    })();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Static ad templates"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition",
          open
            ? "border-violet-300/50 bg-violet-400/20 text-white"
            : "border-white/16 bg-white/5 text-white/85 hover:bg-white/10",
        )}
      >
        <LayoutTemplate className="h-3.5 w-3.5" />
        Templates
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[80] w-[min(460px,calc(100vw-24px))] rounded-2xl border border-white/12 bg-[#0c0a14] p-3.5 shadow-2xl">
          <p className="text-[13px] font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-[12px] text-white/45">{hint}</p>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {CREATOR_PRODUCT_TEMPLATES.map((template) => {
              const active = template.id === selected.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  disabled={openingId !== null}
                  className={cn(
                    "flex w-[84px] shrink-0 flex-col gap-1.5 rounded-xl border p-1.5 text-left transition",
                    active
                      ? "border-violet-300/70 bg-violet-400/15"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25",
                  )}
                >
                  <span className="relative block h-14 w-full overflow-hidden rounded-lg bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={template.imageUrl}
                      alt={template.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-contain"
                    />
                    {openingId === template.id ? (
                      <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      </span>
                    ) : active ? (
                      <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate px-0.5 text-[11px] font-semibold text-white/85">{template.name}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => openSharedWorkflow(selected)}
            disabled={openingId !== null}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-semibold text-zinc-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {openingId === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {openingId === selected.id ? "Opening…" : "Access template"}
          </button>
          <p className="mt-2 text-[12px] font-medium text-white/70">{selected.name}</p>
        </div>
      ) : null}
    </div>
  );
}
