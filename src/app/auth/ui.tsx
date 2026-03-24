"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
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
const APP_REDIRECT_BASE =
  (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.trim()) ||
  "https://app.youry.io";
const AUTH_CALLBACK_FALLBACK = `${APP_REDIRECT_BASE.replace(/\/+$/, "")}/auth/callback`;

/** Must match the URL Google/Supabase redirects to (same origin as the page avoids env mismatches). */
function getAuthCallbackUrl() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  return AUTH_CALLBACK_FALLBACK;
}

export default function AuthClient({ mode = "signin" }: { mode?: AuthMode }) {
  const router = useRouter();
  const supabase = useMemo(() => (HAS_SUPABASE_ENV ? createSupabaseBrowserClient() : null), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!HAS_SUPABASE_ENV) {
    return (
      <div className="min-h-screen bg-[#050507] text-white">
        <main className="mx-auto max-w-xl px-5 py-16">
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
      const { error } = await client.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      toast.success("Account created", {
        description: "If email confirmation is enabled, check your inbox.",
      });
      router.push("/");
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

  async function onGoogle() {
    setIsLoading(true);
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthCallbackUrl(),
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error("Google sign-in error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setIsLoading(false);
    }
  }

  const isSignIn = mode === "signin";
  const primaryBtnClass =
    "h-11 w-full rounded-2xl bg-violet-400 text-black font-semibold border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]";

  return (
    <div className="min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[140px]" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center justify-center px-5 py-14">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl md:grid-cols-[1.05fr_1fr]">
          <div className="border-b border-white/10 p-8 md:border-b-0 md:border-r">
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

            <h1 className="mt-8 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {isSignIn ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-3 max-w-sm text-sm text-white/55">
              {isSignIn
                ? "Sign in to continue building high-converting video ads in minutes."
                : "Sign up and start turning product pages into scroll-stopping video ads."}
            </p>

            <div className="mt-10 space-y-3 text-sm text-white/70">
              {[
                "Generate 10+ ad concepts in seconds",
                "Test faster than your competitors",
                "Never run out of creatives again",
                "Scale your ad testing effortlessly",
              ].map((line) => (
                <p key={line} className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300/90" />
                  <span>{line}</span>
                </p>
              ))}
            </div>
          </div>

          <div className="p-8">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (isSignIn) void onSignIn();
                else void onSignUp();
              }}
            >
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
                  className="h-11 border-white/15 bg-white/[0.03] text-white placeholder:text-white/30"
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
                  className="h-11 border-white/15 bg-white/[0.03] text-white placeholder:text-white/30"
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

