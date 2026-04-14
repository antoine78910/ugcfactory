"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useBrowserSupabaseReady,
  useSupabaseBrowserClient,
} from "@/lib/supabase/BrowserSupabaseProvider";
import { getAuthCallbackUrl } from "@/lib/supabase/authRedirect";

type AuthMode = "signin" | "signup";

export default function AuthClient({ mode = "signin", redirectTo }: { mode?: AuthMode; redirectTo?: string }) {
  const router = useRouter();
  const supabaseReady = useBrowserSupabaseReady();
  const supabase = useSupabaseBrowserClient();

  const redirectQuery =
    redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? `?redirect=${encodeURIComponent(redirectTo)}`
      : "";

  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    window.datafast?.(mode === "signup" ? "view_signup" : "view_signin");
  }, [mode]);

  if (!supabaseReady) {
    return (
      <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-[#050507] text-white">
        <Loader2 className="h-10 w-10 animate-spin text-violet-400" aria-label="Loading" />
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="min-h-[100dvh] min-h-screen overflow-x-hidden bg-[#050507] text-white">
        <main className="mx-auto max-w-xl px-4 py-12 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] sm:px-5 sm:py-16">
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/5 p-6 text-sm text-white/80">
            <p className="font-semibold text-amber-300">Missing Supabase config</p>
            <p className="mt-3">
              Set <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_SUPABASE_URL</code> (or{" "}
              <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_SUPABASE_CUSTOM_DOMAIN</code>) and{" "}
              <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> for all environments in
              Vercel, then trigger a new deployment so the values are applied.
            </p>
          </div>
        </main>
      </div>
    );
  }

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
      router.push(redirectTo || "/");
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
      const fromProps = redirectTo?.trim();
      const pending =
        typeof window !== "undefined" ? sessionStorage.getItem("redeem_token_pending") : null;
      const resumePath =
        fromProps && fromProps.startsWith("/") && !fromProps.startsWith("//")
          ? fromProps
          : pending
            ? `/redeem?token=${encodeURIComponent(pending)}`
            : "";
      const { data: signUpData, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: getAuthCallbackUrl(resumePath || undefined),
          data: { first_name: cleanFirst },
        },
      });
      if (error) throw error;
      window.datafast?.("signup", { email: cleanEmail });
      const dubClickFromCookie =
        typeof document !== "undefined"
          ? (() => {
              const m = document.cookie.match(/(?:^|;\s*)dub_id=([^;]+)/);
              return m?.[1] ? decodeURIComponent(m[1].trim()) : "";
            })()
          : "";
      fetch("/api/track/signup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          userId: signUpData.user?.id ?? "",
          firstName: cleanFirst,
          ...(dubClickFromCookie ? { clickId: dubClickFromCookie } : {}),
        }),
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
        options: { emailRedirectTo: getAuthCallbackUrl(redirectTo) },
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

  const isSignIn = mode === "signin";
  const primaryBtnClass =
    "h-11 w-full rounded-2xl bg-violet-400 text-black font-semibold border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]";

  return (
    <div className="min-h-[100dvh] min-h-screen overflow-x-hidden bg-[#050507] text-white">
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

              {/* Google button */}
              <button
                type="button"
                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.06] font-semibold text-white transition-all hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
                disabled={isLoading}
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    const { data, error } = await client.auth.signInWithOAuth({
                      provider: "google",
                      options: { redirectTo: getAuthCallbackUrl(redirectTo) },
                    });
                    if (error) throw error;
                    if (data.url) {
                      window.location.assign(data.url);
                      return;
                    }
                    throw new Error("No OAuth URL returned. Enable Google in Supabase Auth providers.");
                  } catch (err) {
                    toast.error("Google sign-in error", {
                      description: err instanceof Error ? err.message : "Unknown error",
                    });
                    setIsLoading(false);
                  }
                }}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg">
                    <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="currentColor" fillOpacity=".7"/>
                    <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="currentColor" fillOpacity=".7"/>
                    <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="currentColor" fillOpacity=".7"/>
                    <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="currentColor" fillOpacity=".7"/>
                  </svg>
                )}
                <span>{isLoading ? "Signing in…" : "Continue with Google"}</span>
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-white/50">
              {isSignIn ? "No account yet?" : "Already have an account?"}{" "}
              <Link
                href={isSignIn ? `/signup${redirectQuery}` : `/signin${redirectQuery}`}
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
