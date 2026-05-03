"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

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
      /**
       * Read from localStorage so a redeem flow started in another tab (or
       * pre-existing account with the token saved before a browser restart)
       * still carries the pending token into the email-verification URL.
       */
      const pending =
        typeof window !== "undefined" ? localStorage.getItem("redeem_token_pending") : null;
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
      const dubClickFromUrl =
        typeof window !== "undefined"
          ? (new URLSearchParams(window.location.search).get("dub_id")?.trim() ?? "")
          : "";
      const dubClickId = dubClickFromCookie || dubClickFromUrl;
      console.log("[Dub] signup – dub_id cookie:", dubClickFromCookie || "(none)");
      console.log("[Dub] signup – dub_id url param:", dubClickFromUrl || "(none)");
      console.log(
        "[Dub] signup – clickId for server attribution:",
        dubClickId || "(none, deferred mode)",
      );
      // Server-side only: avoids the 403 that client-side trackLead triggers when
      // app.youry.io is not in Dub's Allowed Hostnames list.
      // The server uses DUB_API_KEY (no origin restriction) and is the single source of truth.
      fetch("/api/track/signup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          userId: signUpData.user?.id ?? "",
          firstName: cleanFirst,
          ...(dubClickId ? { clickId: dubClickId } : {}),
        }),
      })
        .then(async (r) => {
          const json = (await r.json().catch(() => ({}))) as { ok?: boolean; dubTracked?: boolean };
          if (json.dubTracked === false) {
            console.warn("[Dub] /api/track/signup – DUB_API_KEY missing or Dub API request failed. Check Vercel env vars.");
          } else {
            console.log("[Dub] /api/track/signup – lead attributed to Dub ✓", { status: r.status, clickId: dubClickId || "(deferred)" });
          }
        })
        .catch((err) => {
          console.warn("[Dub] /api/track/signup failed:", err);
        });
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

  const isSignIn = mode === "signin";

  async function onGoogle() {
    setGooglePending(true);
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
      setGooglePending(false);
    }
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-black text-white antialiased">
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:justify-center sm:py-10">
        <div className="w-full rounded-2xl border border-white/10 bg-[#0a0a0c] px-5 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:px-8 sm:py-8">
          <div className="flex flex-col items-center text-center">
            <Link href="/" className="inline-flex">
              <Image
                src="/youry-logo.png"
                alt="Youry"
                width={160}
                height={48}
                className="h-8 w-auto sm:h-9"
                priority
              />
            </Link>
            <h1 className="mt-4 text-2xl font-bold tracking-tight sm:mt-5 sm:text-[1.65rem]">
              {isSignIn ? "Welcome back" : "Welcome to Youry"}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-snug text-white/50">AI-powered ad creation platform</p>
          </div>

          {/* Google first so it stays above the fold on mobile */}
          <div className="mt-6 space-y-4 sm:mt-7">
            <button
              type="button"
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-white/25 bg-black font-semibold text-white transition hover:border-white/40 hover:bg-white/[0.04] active:scale-[0.99] disabled:opacity-50"
              disabled={googlePending || isLoading}
              onClick={() => void onGoogle()}
            >
              {googlePending ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
              ) : (
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
                  />
                  <path
                    fill="#34A853"
                    d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
                  />
                  <path
                    fill="#FBBC05"
                    d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782"
                  />
                  <path
                    fill="#EA4335"
                    d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
                  />
                </svg>
              )}
              <span>{googlePending ? "Redirecting…" : "Continue with Google"}</span>
            </button>

            <div className="relative py-0.5">
              <div className="h-px w-full bg-white/15" />
              <span className="absolute left-1/2 top-1/2 w-max max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 bg-[#0a0a0c] px-3 text-center text-[11px] text-white/45">
                {isSignIn ? "Or sign in with email" : "Or sign up with email"}
              </span>
            </div>

            <form
              className="space-y-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (isSignIn) void onSignIn();
                else void onSignUp();
              }}
            >
              {!isSignIn ? (
                <div className="space-y-1.5 text-left">
                  <Label htmlFor="auth-first-name" className="text-xs font-medium text-white/55">
                    Full name
                  </Label>
                  <Input
                    id="auth-first-name"
                    name="given-name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Alex"
                    className="h-11 rounded-xl border-white/15 bg-white/[0.05] text-base text-white placeholder:text-white/35 md:text-sm"
                  />
                </div>
              ) : null}

              <div className="space-y-1.5 text-left">
                <Label htmlFor="auth-email" className="text-xs font-medium text-white/55">
                  Email address
                </Label>
                <Input
                  id="auth-email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="h-11 rounded-xl border-white/15 bg-white/[0.05] text-base text-white placeholder:text-white/35 md:text-sm"
                />
              </div>

              <div className="space-y-1.5 text-left">
                <Label htmlFor="auth-password" className="text-xs font-medium text-white/55">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="auth-password"
                    name="password"
                    autoComplete={isSignIn ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="h-11 rounded-xl border-white/15 bg-white/[0.05] pr-11 text-base text-white placeholder:text-white/35 md:text-sm"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/45 transition hover:bg-white/10 hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="mt-1 h-11 w-full rounded-2xl border border-violet-200/40 bg-violet-400 font-semibold text-black shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-px hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px] active:shadow-none disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSignIn ? "Sign in" : "Create account"}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-white/45">
            {isSignIn ? "No account yet?" : "Already have an account?"}{" "}
            <Link
              href={isSignIn ? `/signup${redirectQuery}` : `/signin${redirectQuery}`}
              className="font-medium text-violet-400 underline-offset-4 hover:text-violet-300 hover:underline"
            >
              {isSignIn ? "Create one" : "Sign in"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
