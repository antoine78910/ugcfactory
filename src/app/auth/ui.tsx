"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
      router.push("/app");
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
      router.push("/app");
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
        options: { emailRedirectTo: `${APP_REDIRECT_BASE.replace(/\/+$/, "")}/` },
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
          redirectTo: `${APP_REDIRECT_BASE.replace(/\/+$/, "")}/`,
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

  return (
    <div className="min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[140px]" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center justify-center px-5 py-14">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl md:grid-cols-[1.05fr_1fr]">
          <div className="border-b border-white/10 p-8 md:border-b-0 md:border-r">
            <Link href="/" className="inline-flex items-center gap-1 text-lg font-bold tracking-tight">
              Youry
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            </Link>

            <h1 className="mt-8 text-3xl font-extrabold tracking-tight sm:text-4xl">
              {isSignIn ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-3 max-w-sm text-sm text-white/55">
              {isSignIn
                ? "Sign in to continue building high-converting video ads in minutes."
                : "Sign up and start turning product pages into scroll-stopping video ads."}
            </p>

            <div className="mt-10 space-y-3 text-sm text-white/60">
              <p>AI product analysis in seconds</p>
              <p>Angle-driven scripts and prompts</p>
              <p>Kling-ready video generation flow</p>
            </div>
          </div>

          <div className="p-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-white/80">Email</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="h-11 border-white/15 bg-white/[0.03] text-white placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white/80">Password</Label>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="••••••••"
                  className="h-11 border-white/15 bg-white/[0.03] text-white placeholder:text-white/30"
                />
              </div>

              {isSignIn ? (
                <Button
                  type="button"
                  className="mt-2 h-11 w-full rounded-full bg-violet-600 text-white hover:bg-violet-500 shadow-[0_0_24px_rgba(139,92,246,0.35)]"
                  onClick={onSignIn}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign in
                </Button>
              ) : (
                <Button
                  type="button"
                  className="mt-2 h-11 w-full rounded-full bg-violet-600 text-white hover:bg-violet-500 shadow-[0_0_24px_rgba(139,92,246,0.35)]"
                  onClick={onSignUp}
                  disabled={isLoading}
                >
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
                variant="secondary"
                className="h-11 w-full rounded-full bg-white/10 text-white hover:bg-white/15"
                onClick={onGoogle}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                <span className="mr-1 text-sm font-semibold">G</span>
                Continue with Google
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full rounded-full bg-white/10 text-white hover:bg-white/15"
                onClick={onMagicLink}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Magic link
              </Button>
            </div>

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

