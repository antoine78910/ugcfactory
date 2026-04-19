"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Key, FlaskConical } from "lucide-react";
import StudioShell from "@/app/_components/StudioShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PERSONAL_API_KEY_LS = "ugc_personal_api_key";
const PERSONAL_API_ENABLED_LS = "ugc_personal_api_enabled";
const PIAPI_PERSONAL_API_KEY_LS = "ugc_piapi_personal_api_key";
const PIAPI_PERSONAL_API_ENABLED_LS = "ugc_piapi_personal_api_enabled";
const ELEVENLABS_PERSONAL_API_KEY_LS = "ugc_elevenlabs_personal_api_key";
const ELEVENLABS_PERSONAL_API_ENABLED_LS = "ugc_elevenlabs_personal_api_enabled";

export default function ApiTestPage() {
  const [personalApiEnabled, setPersonalApiEnabled] = useState(false);
  const [personalApiKey, setPersonalApiKey] = useState("");
  const [piapiEnabled, setPiapiEnabled] = useState(false);
  const [piapiKey, setPiapiKey] = useState("");
  const [elevenEnabled, setElevenEnabled] = useState(false);
  const [elevenKey, setElevenKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showPiapiKey, setShowPiapiKey] = useState(false);
  const [showElevenKey, setShowElevenKey] = useState(false);

  useEffect(() => {
    setPersonalApiEnabled(localStorage.getItem(PERSONAL_API_ENABLED_LS) === "1");
    setPersonalApiKey(localStorage.getItem(PERSONAL_API_KEY_LS) ?? "");
    setPiapiEnabled(localStorage.getItem(PIAPI_PERSONAL_API_ENABLED_LS) === "1");
    setPiapiKey(localStorage.getItem(PIAPI_PERSONAL_API_KEY_LS) ?? "");
    setElevenEnabled(localStorage.getItem(ELEVENLABS_PERSONAL_API_ENABLED_LS) === "1");
    setElevenKey(localStorage.getItem(ELEVENLABS_PERSONAL_API_KEY_LS) ?? "");
  }, []);

  function togglePersonalApi() {
    const next = !personalApiEnabled;
    setPersonalApiEnabled(next);
    localStorage.setItem(PERSONAL_API_ENABLED_LS, next ? "1" : "0");
    if (!next) {
      setPersonalApiKey("");
      localStorage.removeItem(PERSONAL_API_KEY_LS);
    }
  }

  function savePersonalApiKey(v: string) {
    const key = v.trim();
    setPersonalApiKey(v);
    if (key) {
      localStorage.setItem(PERSONAL_API_KEY_LS, key);
      localStorage.setItem(PERSONAL_API_ENABLED_LS, "1");
      setPersonalApiEnabled(true);
      return;
    }
    localStorage.removeItem(PERSONAL_API_KEY_LS);
  }

  function togglePiapi() {
    const next = !piapiEnabled;
    setPiapiEnabled(next);
    localStorage.setItem(PIAPI_PERSONAL_API_ENABLED_LS, next ? "1" : "0");
    if (!next) {
      setPiapiKey("");
      localStorage.removeItem(PIAPI_PERSONAL_API_KEY_LS);
    }
  }

  function savePiapiKey(v: string) {
    const key = v.trim();
    setPiapiKey(v);
    if (key) {
      localStorage.setItem(PIAPI_PERSONAL_API_KEY_LS, key);
      localStorage.setItem(PIAPI_PERSONAL_API_ENABLED_LS, "1");
      setPiapiEnabled(true);
      return;
    }
    localStorage.removeItem(PIAPI_PERSONAL_API_KEY_LS);
  }

  function toggleEleven() {
    const next = !elevenEnabled;
    setElevenEnabled(next);
    localStorage.setItem(ELEVENLABS_PERSONAL_API_ENABLED_LS, next ? "1" : "0");
    if (!next) {
      setElevenKey("");
      localStorage.removeItem(ELEVENLABS_PERSONAL_API_KEY_LS);
    }
  }

  function saveElevenKey(v: string) {
    const key = v.trim();
    setElevenKey(v);
    if (key) {
      localStorage.setItem(ELEVENLABS_PERSONAL_API_KEY_LS, key);
      localStorage.setItem(ELEVENLABS_PERSONAL_API_ENABLED_LS, "1");
      setElevenEnabled(true);
      return;
    }
    localStorage.removeItem(ELEVENLABS_PERSONAL_API_KEY_LS);
  }

  return (
    <StudioShell>
      <div className="relative min-w-0 overflow-x-hidden">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-600/10 blur-[120px]" />

        <div className="relative mx-auto max-w-3xl space-y-10 px-5 py-10 md:px-8 md:py-12">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="gap-2 text-white/60 hover:text-white">
              <Link href="/link-to-ad">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Studio
              </Link>
            </Button>
          </div>

          <header className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1">
              <FlaskConical className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200/80">
                API test
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Personal API keys (sandbox)</h1>
            <p className="max-w-xl text-sm leading-relaxed text-white/50">
              This page is only for accounts listed in{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white/70">
                API_TEST_ALLOWED_EMAILS
              </code>
              . Keys stay in your browser (localStorage), same as on{" "}
              <Link href="/credits" className="text-cyan-300/90 underline-offset-4 hover:underline">
                /credits
              </Link>
              . With personal keys enabled and filled in, the studio can bypass platform credit checks for the matching
              flows.
            </p>
          </header>

          <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] to-transparent p-6 md:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                    <Key className="h-4.5 w-4.5" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Primary video API</h2>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">
                      Personal key for default video/image generation: usage is billed to your own account; no platform
                      credit charge when this mode is on.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={personalApiEnabled}
                  onClick={togglePersonalApi}
                  className={cn(
                    "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
                    personalApiEnabled ? "bg-amber-500" : "bg-white/15",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                      personalApiEnabled ? "translate-x-[22px]" : "translate-x-[2px]",
                    )}
                  />
                </button>
              </div>

              {personalApiEnabled ? (
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-white/40">API key</label>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      placeholder="Paste key…"
                      value={personalApiKey}
                      onChange={(e) => savePersonalApiKey(e.target.value)}
                      className="h-10 border-amber-500/20 bg-black/40 pr-10 font-mono text-sm text-white placeholder:text-white/25 focus-visible:ring-amber-500/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/70"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {personalApiKey.trim() ? (
                    <p className="text-[11px] text-emerald-400/80">Saved locally.</p>
                  ) : (
                    <p className="text-[11px] text-amber-400/60">Enter a key to enable platform credit bypass.</p>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-transparent p-6 md:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                    <Key className="h-4.5 w-4.5" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Alternate video API</h2>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">
                      Optional second key for some video models: same idea, no platform credit charge on those flows when
                      this mode is on.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={piapiEnabled}
                  onClick={togglePiapi}
                  className={cn(
                    "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
                    piapiEnabled ? "bg-violet-500" : "bg-white/15",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                      piapiEnabled ? "translate-x-[22px]" : "translate-x-[2px]",
                    )}
                  />
                </button>
              </div>

              {piapiEnabled ? (
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-white/40">API key</label>
                  <div className="relative">
                    <Input
                      type={showPiapiKey ? "text" : "password"}
                      placeholder="Paste key…"
                      value={piapiKey}
                      onChange={(e) => savePiapiKey(e.target.value)}
                      className="h-10 border-violet-500/20 bg-black/40 pr-10 font-mono text-sm text-white placeholder:text-white/25 focus-visible:ring-violet-500/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPiapiKey(!showPiapiKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/70"
                    >
                      {showPiapiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {piapiKey.trim() ? (
                    <p className="text-[11px] text-emerald-400/80">Saved locally.</p>
                  ) : (
                    <p className="text-[11px] text-violet-300/60">Enter a key to enable platform credit bypass.</p>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] to-transparent p-6 md:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                    <Key className="h-4.5 w-4.5" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Voice change</h2>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">
                      Personal key for speech-to-speech voice change: usage is billed to your own account.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={elevenEnabled}
                  onClick={toggleEleven}
                  className={cn(
                    "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
                    elevenEnabled ? "bg-emerald-500" : "bg-white/15",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                      elevenEnabled ? "translate-x-[22px]" : "translate-x-[2px]",
                    )}
                  />
                </button>
              </div>

              {elevenEnabled ? (
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-white/40">API key</label>
                  <div className="relative">
                    <Input
                      type={showElevenKey ? "text" : "password"}
                      placeholder="Paste key…"
                      value={elevenKey}
                      onChange={(e) => saveElevenKey(e.target.value)}
                      className="h-10 border-emerald-500/20 bg-black/40 pr-10 font-mono text-sm text-white placeholder:text-white/25 focus-visible:ring-emerald-500/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowElevenKey(!showElevenKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/70"
                    >
                      {showElevenKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {elevenKey.trim() ? (
                    <p className="text-[11px] text-emerald-400/80">Saved locally.</p>
                  ) : (
                    <p className="text-[11px] text-emerald-300/60">Enter a key to use your own account for voice change.</p>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </StudioShell>
  );
}
