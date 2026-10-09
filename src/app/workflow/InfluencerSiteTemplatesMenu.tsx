"use client";

import { Check, LayoutTemplate, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { isInfluencerAccount } from "@/lib/influencerAccounts";
import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";
import { cn } from "@/lib/utils";

type SiteTemplate = {
  id: string;
  name: string;
  niche: string;
  /** Visual stand-in for the pre-generated static. */
  gradient: string;
  accent: string;
  headline: string;
};

/** Five leaderboard site templates influencers can launch. Output is pre-generated. */
const SITE_TEMPLATES: SiteTemplate[] = [
  {
    id: "glow-serum",
    name: "Glow Serum",
    niche: "Beauty",
    gradient: "from-rose-400 via-fuchsia-500 to-violet-700",
    accent: "text-rose-100",
    headline: "Glass skin in 7 days",
  },
  {
    id: "street-drop",
    name: "Street Drop",
    niche: "Fashion",
    gradient: "from-zinc-200 via-zinc-500 to-zinc-950",
    accent: "text-white",
    headline: "The drop is live",
  },
  {
    id: "desk-kit",
    name: "Desk Kit",
    niche: "Tech",
    gradient: "from-sky-300 via-blue-600 to-indigo-950",
    accent: "text-sky-50",
    headline: "Your desk, finally quiet",
  },
  {
    id: "morning-ritual",
    name: "Morning Ritual",
    niche: "Wellness",
    gradient: "from-amber-200 via-orange-400 to-rose-700",
    accent: "text-amber-50",
    headline: "One scoop. Done.",
  },
  {
    id: "carry-on",
    name: "Carry On",
    niche: "Travel",
    gradient: "from-emerald-300 via-teal-600 to-slate-950",
    accent: "text-emerald-50",
    headline: "Pack once. Go.",
  },
];

const LOADING_STEPS = [
  { label: "Writing copy", ms: 1800 },
  { label: "Generating images", ms: 2200 },
  { label: "Rendering video", ms: 2200 },
  { label: "Finishing", ms: 1400 },
] as const;

function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  try {
    const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    const u = new URL(withProto);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

function TemplateThumb({
  template,
  selected,
  onSelect,
}: {
  template: SiteTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-[92px] shrink-0 flex-col gap-1.5 rounded-xl border p-1.5 text-left transition",
        selected
          ? "border-violet-300/70 bg-violet-400/15"
          : "border-white/10 bg-white/[0.03] hover:border-white/25",
      )}
    >
      <span
        className={cn(
          "relative flex h-14 w-full items-end overflow-hidden rounded-lg bg-gradient-to-br p-1.5",
          template.gradient,
        )}
      >
        <span className={cn("text-[9px] font-semibold leading-tight", template.accent)}>{template.headline}</span>
        {selected ? (
          <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white">
            <Check className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </span>
      <span className="truncate px-0.5 text-[11px] font-semibold text-white/85">{template.name}</span>
      <span className="truncate px-0.5 text-[10px] text-white/40">{template.niche}</span>
    </button>
  );
}

export function InfluencerSiteTemplatesMenu() {
  const sb = useSupabaseBrowserClient();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(SITE_TEMPLATES[0].id);
  const [productUrl, setProductUrl] = useState("");
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [urlError, setUrlError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const runToken = useRef(0);

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

  useEffect(() => {
    if (phase !== "running") return;
    const token = runToken.current;
    let cancelled = false;
    let timer = 0;
    const run = (index: number) => {
      if (cancelled || token !== runToken.current) return;
      if (index >= LOADING_STEPS.length) {
        setPhase("done");
        return;
      }
      setStepIndex(index);
      timer = window.setTimeout(() => run(index + 1), LOADING_STEPS[index].ms);
    };
    run(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phase]);

  if (!visible) return null;

  const selected = SITE_TEMPLATES.find((t) => t.id === selectedId) ?? SITE_TEMPLATES[0];

  const onLaunch = () => {
    if (phase === "running") return;
    if (!looksLikeUrl(productUrl)) {
      setUrlError("Paste a product link first.");
      return;
    }
    setUrlError(null);
    runToken.current += 1;
    setStepIndex(0);
    setPhase("running");
  };

  const onPick = (id: string) => {
    setSelectedId(id);
    runToken.current += 1;
    setPhase("idle");
    setStepIndex(0);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Leaderboard site templates"
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
        <div className="absolute right-0 top-[calc(100%+8px)] z-[80] w-[min(440px,calc(100vw-24px))] rounded-2xl border border-white/12 bg-[#0c0a14] p-3.5 shadow-2xl">
          <p className="text-[13px] font-semibold text-white">Leaderboard sites</p>
          <p className="mt-0.5 text-[12px] text-white/45">
            Pick a template, paste a product link, and launch the pre-built static.
          </p>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {SITE_TEMPLATES.map((template) => (
              <TemplateThumb
                key={template.id}
                template={template}
                selected={template.id === selected.id}
                onSelect={() => onPick(template.id)}
              />
            ))}
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/40">
              Product link
            </span>
            <input
              value={productUrl}
              onChange={(e) => {
                setProductUrl(e.target.value);
                if (urlError) setUrlError(null);
              }}
              placeholder="https://your-store.com/product"
              className="h-9 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-violet-400/45"
            />
          </label>
          {urlError ? <p className="mt-1 text-[12px] text-rose-300">{urlError}</p> : null}

          <button
            type="button"
            onClick={onLaunch}
            disabled={phase === "running"}
            className={cn(
              "mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-white text-[13px] font-semibold text-zinc-900 transition hover:bg-white/90",
              phase === "running" && "cursor-not-allowed opacity-70",
            )}
          >
            {phase === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {phase === "running" ? LOADING_STEPS[stepIndex]?.label ?? "Working…" : "Launch template"}
          </button>

          {phase === "running" ? (
            <ol className="mt-3 space-y-1.5">
              {LOADING_STEPS.map((step, i) => {
                const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "wait";
                return (
                  <li key={step.label} className="flex items-center gap-2 text-[12px]">
                    <span
                      className={cn(
                        "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px]",
                        state === "done" && "border-emerald-300/40 bg-emerald-400/20 text-emerald-100",
                        state === "active" && "border-violet-300/50 bg-violet-400/20 text-violet-100",
                        state === "wait" && "border-white/10 text-white/30",
                      )}
                    >
                      {state === "done" ? <Check className="h-2.5 w-2.5" /> : i + 1}
                    </span>
                    <span className={state === "wait" ? "text-white/35" : "text-white/80"}>{step.label}</span>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {phase === "done" ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
              <div className={cn("flex h-40 flex-col justify-end bg-gradient-to-br p-4", selected.gradient)}>
                <p className={cn("text-[11px] font-medium uppercase tracking-wide opacity-80", selected.accent)}>
                  {selected.niche} · {selected.name}
                </p>
                <p className={cn("mt-1 text-[20px] font-semibold leading-tight", selected.accent)}>{selected.headline}</p>
              </div>
              <p className="truncate px-3 py-2 text-[12px] text-white/50">{productUrl.trim()}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
