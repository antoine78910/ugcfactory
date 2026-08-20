"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, X } from "lucide-react";
import { toast } from "sonner";

import { saveAndEnablePersonalApiKey } from "@/app/_components/CreditsPlanContext";
import {
  PERSONAL_API_KEY_REQUIRED_EVENT,
  type PersonalApiKeyRequiredDetail,
} from "@/lib/personalApiKeyEvents";

/**
 * Shown when a free-plan user tries to generate without a personal Kie API key.
 * Keys stay in localStorage and are sent with generation requests (BYOK via kie.ai).
 */
export default function PersonalApiKeyModal() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [kieKey, setKieKey] = useState("");
  const [showKie, setShowKie] = useState(false);

  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<PersonalApiKeyRequiredDetail>;
      setMessage(typeof ce.detail?.message === "string" ? ce.detail.message : null);
      setOpen(true);
    }
    window.addEventListener(PERSONAL_API_KEY_REQUIRED_EVENT, handler as EventListener);
    return () => window.removeEventListener(PERSONAL_API_KEY_REQUIRED_EVENT, handler as EventListener);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  function save() {
    if (!saveAndEnablePersonalApiKey(kieKey)) {
      toast.error("Paste your Kie API key to continue.");
      return;
    }
    toast.success("Kie API key saved. Generations will bill your kie.ai account.");
    setOpen(false);
    setKieKey("");
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0912] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Add your Kie API key</h2>
            <p className="mt-1 text-sm leading-relaxed text-white/60">
              {message?.trim() ||
                "On the free plan, generations use your kie.ai account directly. No platform credits required."}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-white/50">Kie API key (kie.ai)</span>
            <div className="flex gap-2">
              <input
                type={showKie ? "text" : "password"}
                value={kieKey}
                onChange={(e) => setKieKey(e.target.value)}
                placeholder="Paste key from kie.ai"
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKie((v) => !v)}
                className="shrink-0 rounded-xl border border-white/10 px-3 text-xs text-white/60 hover:bg-white/5 hover:text-white"
              >
                {showKie ? "Hide" : "Show"}
              </button>
            </div>
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={save}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-violet-600 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Save and continue
          </button>
          <Link
            href="/pricing"
            onClick={close}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-white/15 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            Or view plans
          </Link>
        </div>
      </div>
    </div>
  );
}
