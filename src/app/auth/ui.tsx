"use client";

import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "signin" | "signup";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const HAS_SUPABASE_ENV = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const APP_REDIRECT_BASE =
  (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
  "https://app.youry.io";
const AUTH_CALLBACK_FALLBACK = `${APP_REDIRECT_BASE.replace(/\/+$/, "")}/auth/callback`;

function getAuthCallbackUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.trim()) return AUTH_CALLBACK_FALLBACK;
  if (typeof window !== "undefined" && window.location?.origin) return `${window.location.origin}/auth/callback`;
  return AUTH_CALLBACK_FALLBACK;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function AuthClient({ mode = "signin" }: { mode?: AuthMode }) {
  const router = useRouter();
  const supabase = useMemo(() => (HAS_SUPABASE_ENV ? createSupabaseBrowserClient() : null), []);

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    window.datafast?.(mode === "signup" ? "view_signup" : "view_signin");
  }, [mode]);

  if (!HAS_SUPABASE_ENV) {
    return (
      <div className="min-h-[100dvh] min-h-screen overflow-x-hidden bg-[#050507] text-white">
        <main className="mx-auto max-w-xl px-4 py-12 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] sm:px-5 sm:py-16">
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/5 p-6 text-sm text-white/80">
            <p className="font-semibold text-amber-300">Missing Supabase config</p>
            <p className="mt-3">
              Define <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel, then redeploy.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!supabase) return null;
  const client = supabase;

  async function onSignIn() {
    setIsLoading(true);
    try {
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      window.datafast?.("signin");
      toast.success("Signed in");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error("Sign in error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function onSignUp() {
    setIsLoading(true);
    try {
      const cleanFirst = firstName.trim();
      if (!cleanFirst) {
        toast.error("First name required", { description: "Please enter your first name." });
        return;
      }
      const cleanEmail = email.trim();
      const { error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: getAuthCallbackUrl(),
          data: { first_name: cleanFirst },
        },
      });
      if (error) throw error;
      window.datafast?.("signup", { email: cleanEmail });
      fetch("/api/track/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      }).catch(() => {});
      toast.success("Account created", { description: "Check your inbox to confirm your email." });
      router.push(`/auth/check-email?email=${encodeURIComponent(cleanEmail)}`);
      router.refresh();
    } catch (err) {
      toast.error("Sign up error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function onMagicLink() {
    setIsLoading(true);
    try {
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: getAuthCallbackUrl() },
      });
      if (error) throw error;
      toast.success("Magic link sent", { description: "Check your email inbox." });
    } catch (err) {
      toast.error("Magic link error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const gisContainerRef = useRef<HTMLDivElement>(null);
  const gisInitializedRef = useRef(false);

  const handleGoogleCredential = useCallback(
    async (response: { credential?: string }) => {
      const idToken = response.credential;
      if (!idToken) {
        toast.error("Google sign-in failed", { description: "No credential received." });
        return;
      }
      setIsLoading(true);
      try {
        const { error } = await client.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        });
        if (error) throw error;
        window.datafast?.(mode === "signup" ? "signup" : "signin");
        toast.success(mode === "signup" ? "Account created" : "Signed in");
        router.push("/");
        router.refresh();
      } catch (err) {
        toast.error("Google sign-in error", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [client, mode, router],
  );

  const initGis = useCallback(() => {
    if (gisInitializedRef.current || !window.google || !GOOGLE_CLIENT_ID || !gisContainerRef.current) return;
    gisInitializedRef.current = true;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      ux_mode: "popup",
    });
    window.google.accounts.id.renderButton(gisContainerRef.current, {
      theme: "filled_black",
      size: "large",
      text: "continue_with",
      shape: "pill",
      width: 320,
    });
  }, [handleGoogleCredential]);

  useEffect(() => {
    initGis();
  }, [initGis]);

  function onGoogle() {
    if (!GOOGLE_CLIENT_ID) {
      toast.error("Google sign-in unavailable", { description: "Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID." });
      return;
    }
    const btn = gisContainerRef.current?.querySelector<HTMLElement>('[role="button"], iframe, div[style]');
    if (btn) {
      btn.click();
      return;
    }
    window.google?.accounts.id.prompt();
  }

  const isSignIn = mode === "signin";
  const primaryBtnClass =
    "h-11 w-full rounded-2xl bg-violet-400 text-black font-semibold border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]";

  return (
    <div className="min-h-[100dvh] min-h-screen overflow-x-hidden bg-[#050507] text-white">
      {GOOGLE_CLIENT_ID ? (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGis}
        />
      ) : null}
      <div ref={gisContainerRef} className="pointer-events-none fixed -left-[9999px] top-0 h-0 w-0 overflow-hidden opacity-0" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[min(420px,70vh)] w-[min(100vw,900px)] max-w-[100vw] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[100px] sm:h-[520px] sm:blur-[140px]"
        aria-hidden
      />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] min-h-screen w-full max-w-6xl items-stretch justify-center px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center sm:px-5 sm:py-14">
        <div className="grid w-full min-w-0 max-w-5xl self-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl sm:rounded-3xl md:grid-cols-[1.05fr_1fr]">
          <div className="min-w-0 border-b border-white/10 p-5 sm:p-8 md:border-b-0 md:border-r">
            <Link href="/" className="inline-flex items-center">
              <Image
                src="/youry-logo.png"
                alt="Youry"
                width={174}
                height={52}
                className="h-9 w-auto sm:h-10"
                priority
              />
            </Link>

            <h1 className="mt-6 text-2xl font-extrabold tracking-tight sm:mt-8 sm:text-3xl md:text-4xl">
              {isSignIn ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/55">
              {isSignIn
                ? "Sign in to continue building high-converting video ads in minutes."
                : "Sign up and start turning product pages into scroll-stopping video ads."}
            </p>

            <div className="mt-6 space-y-2.5 text-sm text-white/70 sm:mt-10 sm:space-y-3">
              {[
                "Cut your creative production costs by 10x",
                "Generate 10+ ad concepts in seconds",
                "Test faster than your competitors",
                "Never run out of creatives again",
                "Scale your ad testing effortlessly",
              ].map((line) => (
                <p key={line} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/90" />
                  <span className="min-w-0 break-words">{line}</span>
                </p>
              ))}
            </div>
          </div>

          <div className="min-w-0 p-5 sm:p-8">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (isSignIn) void onSignIn();
                else void onSignUp();
              }}
            >
              {!isSignIn ? (
                <div className="space-y-2">
                  <Label htmlFor="auth-first-name" className="text-white/80">
                    First name
                  </Label>
                  <Input
                    id="auth-first-name"
                    name="given-name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Alex"
                    className="h-11 border-white/15 bg-white/[0.03] text-base text-white placeholder:text-white/30 md:text-sm"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="auth-email" className="text-white/80">
                  Email
                </Label>
                <Input
                  id="auth-email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="h-11 border-white/15 bg-white/[0.03] text-base text-white placeholder:text-white/30 md:text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="auth-password" className="text-white/80">
                  Password
                </Label>
                <Input
                  id="auth-password"
                  name="password"
                  autoComplete={isSignIn ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="••••••••"
                  className="h-11 border-white/15 bg-white/[0.03] text-base text-white placeholder:text-white/30 md:text-sm"
                />
              </div>

              {isSignIn ? (
                <Button type="submit" className={`mt-2 ${primaryBtnClass}`} disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign in
                </Button>
              ) : (
                <Button type="submit" className={`mt-2 ${primaryBtnClass}`} disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create account
                </Button>
              )}

              <div className="relative py-1">
                <div className="h-px w-full bg-white/15" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#050507] px-2 text-[11px] uppercase tracking-[0.16em] text-white/40">
                  or
                </span>
              </div>

              <Button
                type="button"
                className={primaryBtnClass}
                onClick={onGoogle}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                <span className="mr-1 text-sm font-semibold">G</span>
                Continue with Google
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-white/50">
              {isSignIn ? "No account yet?" : "Already have an account?"} {" "}
              <Link
                href={isSignIn ? "/signup" : "/signin"}
                className="text-violet-400 hover:text-violet-300"
              >
                {isSignIn ? "Create one" : "Sign in"}
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

