"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Gift, Loader2, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import {
  useBrowserSupabaseReady,
  useSupabaseBrowserClient,
} from "@/lib/supabase/BrowserSupabaseProvider";
import {
  dispatchAuthoritativeCreditBalance,
  dispatchSubscriptionRefresh,
} from "@/app/_components/CreditsPlanContext";

type Status = "loading" | "success" | "error" | "no-token";
type GrantType = "credits" | "plan";

const PLAN_DISPLAY: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  scale: "Scale",
};

/* ---------- confetti / particles canvas ---------- */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  opacity: number;
  gravity: number;
  drag: number;
  wobblePhase: number;
  wobbleSpeed: number;
}

const CONFETTI_COLORS = [
  "#a78bfa", "#c084fc", "#818cf8", "#f0abfc", "#67e8f9",
  "#fbbf24", "#34d399", "#f472b6", "#fcd34d", "#6ee7b7",
  "#e879f9", "#60a5fa", "#fb923c", "#facc15", "#a5f3fc",
];

function spawnParticles(count: number, originX: number, originY: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 10;
    out.push({
      x: originX + (Math.random() - 0.5) * 60,
      y: originY + (Math.random() - 0.5) * 30,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4 - Math.random() * 6,
      w: 5 + Math.random() * 6,
      h: 3 + Math.random() * 8,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 14,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      opacity: 1,
      gravity: 0.12 + Math.random() * 0.08,
      drag: 0.985 + Math.random() * 0.01,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.03 + Math.random() * 0.04,
    });
  }
  return out;
}

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const tRef = useRef(0);

  const burst = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const cx = c.width / 2;
    const cy = c.height * 0.38;
    particlesRef.current.push(...spawnParticles(120, cx, cy));
    // Side bursts
    particlesRef.current.push(...spawnParticles(40, cx - c.width * 0.25, cy + 20));
    particlesRef.current.push(...spawnParticles(40, cx + c.width * 0.25, cy + 20));
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      c.width = c.offsetWidth * 2;
      c.height = c.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();
    window.addEventListener("resize", resize);

    // Initial burst after a brief delay
    const t1 = setTimeout(burst, 200);
    const t2 = setTimeout(burst, 700);
    const t3 = setTimeout(burst, 1300);

    const loop = () => {
      tRef.current++;
      const w = c.width / 2;
      const h = c.height / 2;
      ctx.clearRect(0, 0, w, h);

      const ps = particlesRef.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.vy += p.gravity;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.x += p.vx + Math.sin(tRef.current * p.wobbleSpeed + p.wobblePhase) * 0.6;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        if (p.y > h + 40) {
          p.opacity -= 0.05;
        } else if (p.opacity < 1) {
          p.opacity = Math.min(1, p.opacity + 0.02);
        }

        if (p.opacity <= 0) {
          ps.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", resize);
    };
  }, [burst]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      aria-hidden
    />
  );
}

/* ---------- animated counter ---------- */

function AnimatedCounter({ target, duration = 1800 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - t, 4); // ease-out quart
      setValue(Math.round(ease * target));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return <>{value}</>;
}

/* ---------- glow ring ---------- */

function GlowRing() {
  return (
    <div className="absolute inset-0 -z-[1]">
      <div
        className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full opacity-60 blur-[80px]"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.5), rgba(168,85,247,0.15), transparent 70%)" }}
      />
      <div
        className="absolute left-1/2 top-1/3 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-[50px]"
        style={{
          background: "radial-gradient(circle, rgba(251,191,36,0.35), transparent 65%)",
          animation: "pulse 2.5s ease-in-out infinite alternate",
        }}
      />
    </div>
  );
}

/* ---------- main page ---------- */

function RedeemPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token")?.trim() ?? "";

  const supabase = useSupabaseBrowserClient();
  const supabaseReady = useBrowserSupabaseReady();
  const [status, setStatus] = useState<Status>("loading");
  const [credited, setCredited] = useState(0);
  const [grantType, setGrantType] = useState<GrantType>("credits");
  const [planId, setPlanId] = useState<string | null>(null);
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null);
  const [bundlePlanId, setBundlePlanId] = useState<string | null>(null);
  const [bundlePlanExpiresAt, setBundlePlanExpiresAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const attempted = useRef(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    /**
     * localStorage (not sessionStorage): the email verification link is almost
     * always opened in a different tab (mail client / new browser tab) from the
     * one that started signup, so a sessionStorage-scoped token would be
     * invisible there and the RedeemTokenGuard could not resume the flow,
     * dumping the creator on /onboarding instead of /redeem.
     */
    const pending =
      typeof window !== "undefined" ? localStorage.getItem("redeem_token_pending") : null;
    const effectiveToken = token || pending || "";

    if (!effectiveToken) {
      setStatus("no-token");
      return;
    }

    if (!supabaseReady) return;

    if (supabase === null) {
      setErrorMsg("App configuration is incomplete. Please contact support.");
      setStatus("error");
      return;
    }

    if (token) {
      localStorage.removeItem("redeem_token_pending");
    }

    if (!token && effectiveToken) {
      router.replace(`/redeem?token=${encodeURIComponent(effectiveToken)}`);
      return;
    }

    if (attempted.current) return;
    attempted.current = true;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        const secret = token;
        if (typeof window !== "undefined") {
          localStorage.setItem("redeem_token_pending", secret);
          const back = `/redeem?token=${encodeURIComponent(secret)}`;
          router.replace(`/signin?redirect=${encodeURIComponent(back)}`);
        }
        return;
      }

      try {
        const res = await fetch("/api/credits/redeem", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          credited?: number;
          balance?: number;
          error?: string;
          grantType?: GrantType;
          planId?: string;
          planExpiresAt?: string;
          bundlePlanId?: string | null;
          bundlePlanExpiresAt?: string | null;
        };

        if (res.ok && json.success) {
          setCredited(json.credited ?? 0);
          setGrantType(json.grantType === "plan" ? "plan" : "credits");
          setPlanId(json.planId ?? null);
          setPlanExpiresAt(json.planExpiresAt ?? null);
          setBundlePlanId(json.bundlePlanId ?? null);
          setBundlePlanExpiresAt(json.bundlePlanExpiresAt ?? null);
          setStatus("success");
          if (
            typeof json.balance === "number" &&
            Number.isFinite(json.balance) &&
            json.balance >= 0
          ) {
            dispatchAuthoritativeCreditBalance(json.balance);
          }
          /**
           * Plan or bundle link: a complimentary subscription was just inserted
           * server-side. Ask the provider to refetch `/api/me/subscription` so
           * `planId`, `studioAccessAllowed` (and the sidebar plan badge) reflect
           * the new comp plan. Without this, `StudioAccessGuard` keeps the stale
           * `studioAccessAllowed=false` from the fresh-account initial fetch and
           * bounces the creator to `/onboarding?step=setup` on "Open the App".
           */
          if (json.grantType === "plan" || json.bundlePlanId) {
            dispatchSubscriptionRefresh();
          }
        } else {
          setErrorMsg(json.error ?? "Redemption failed");
          setStatus("error");
        }
      } catch {
        setErrorMsg("Network error, please try again.");
        setStatus("error");
      }
    })();
  }, [token, supabase, supabaseReady, router]);

  // Stagger the success card entrance
  useEffect(() => {
    if (status === "success") {
      const t = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(t);
    }
  }, [status]);

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#06070d] px-4 text-white">
      {status === "success" && (
        <>
          <ConfettiCanvas />
          <GlowRing />
        </>
      )}

      {/* ---- Loading ---- */}
      {status === "loading" && (
        <div className="animate-in fade-in zoom-in-95 duration-500 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0d0d12] p-8 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
          <div className="relative mx-auto h-14 w-14">
            <div className="absolute inset-0 animate-ping rounded-full bg-violet-500/20" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/10">
              <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            </div>
          </div>
          <p className="mt-5 text-[15px] font-semibold text-white/80">Redeeming your credits…</p>
          <div className="mx-auto mt-4 h-1 w-32 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full animate-[shimmer_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
          </div>
        </div>
      )}

      {/* ---- Success ---- */}
      {status === "success" && (
        <div
          className="relative z-20 w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.1] bg-[#0d0d12]/95 p-10 text-center shadow-[0_32px_80px_rgba(0,0,0,0.6)] backdrop-blur-sm transition-all duration-700 ease-out"
          style={{
            opacity: showContent ? 1 : 0,
            transform: showContent ? "translateY(0) scale(1)" : "translateY(24px) scale(0.95)",
          }}
        >
          {/* Decorative top shimmer */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />

          {/* Gift icon with rings */}
          <div className="relative mx-auto mb-6 h-24 w-24">
            <div
              className="absolute inset-0 rounded-full border-2 border-violet-400/30"
              style={{ animation: "scaleRing 2s ease-out infinite" }}
            />
            <div
              className="absolute -inset-3 rounded-full border border-violet-400/15"
              style={{ animation: "scaleRing 2s ease-out 0.3s infinite" }}
            />
            <div
              className="absolute -inset-6 rounded-full border border-violet-400/8"
              style={{ animation: "scaleRing 2s ease-out 0.6s infinite" }}
            />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/25 to-fuchsia-500/15 shadow-[0_0_40px_rgba(139,92,246,0.25)]">
              <Sparkles className="h-10 w-10 text-violet-300 drop-shadow-[0_0_12px_rgba(167,139,250,0.6)]" strokeWidth={1.75} />
            </div>
          </div>

          {/* Counter */}
          {grantType === "plan" ? (
            <>
              <p className="text-[14px] font-semibold uppercase tracking-widest text-violet-300/80">
                You&apos;re on
              </p>
              <p className="mt-2 bg-gradient-to-r from-violet-200 via-white to-fuchsia-200 bg-clip-text text-[44px] font-extrabold leading-none text-transparent drop-shadow-[0_0_20px_rgba(167,139,250,0.3)]">
                {planId ? PLAN_DISPLAY[planId] ?? planId : "your plan"}
              </p>
              <p className="mt-2 text-[15px] font-semibold tracking-tight text-white/85">
                Full plan access unlocked
              </p>
              {credited > 0 && (
                <p className="mt-3 text-[13px] text-white/60">
                  + <span className="font-semibold text-amber-200">{credited}</span> credits added
                </p>
              )}
              <p className="mx-auto mt-4 max-w-[300px] text-[13px] leading-relaxed text-white/45">
                {planExpiresAt
                  ? `Access is valid until ${new Date(planExpiresAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.`
                  : "Enjoy your plan access."}
                {" "}No card required.
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold uppercase tracking-widest text-violet-300/80">
                You received
              </p>
              <p className="mt-2 bg-gradient-to-r from-violet-200 via-white to-fuchsia-200 bg-clip-text text-[56px] font-extrabold leading-none text-transparent drop-shadow-[0_0_20px_rgba(167,139,250,0.3)]">
                <AnimatedCounter target={credited} />
              </p>
              <p className="mt-1 text-[18px] font-bold tracking-tight text-white/90">
                credit{credited !== 1 ? "s" : ""}
              </p>
              {bundlePlanId && (
                <div className="mx-auto mt-4 max-w-[300px] rounded-xl border border-violet-500/30 bg-violet-500/[0.08] px-4 py-3">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-violet-300/90">
                    Bonus
                  </p>
                  <p className="mt-1 text-[15px] font-bold text-white/95">
                    {PLAN_DISPLAY[bundlePlanId] ?? bundlePlanId} plan unlocked
                  </p>
                  <p className="mt-1 text-[12px] text-white/55">
                    {bundlePlanExpiresAt
                      ? `Full access until ${new Date(bundlePlanExpiresAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.`
                      : "Full access included."}
                    {" "}No card required.
                  </p>
                </div>
              )}
              <p className="mx-auto mt-4 max-w-[280px] text-[13px] leading-relaxed text-white/45">
                Ready to use, they expire in 3 months. Go create something amazing.
              </p>
            </>
          )}

          {/* CTA */}
          <Link
            href="/"
            className="group relative mt-8 inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-3 text-[14px] font-semibold text-white shadow-[0_4px_24px_rgba(139,92,246,0.35)] transition-all hover:shadow-[0_4px_32px_rgba(139,92,246,0.5)] hover:brightness-110"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 transition-opacity group-hover:opacity-100" />
            Open the App
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>

          {/* Bottom shimmer */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/40 to-transparent" />
        </div>
      )}

      {/* ---- Error ---- */}
      {status === "error" && (
        <div className="animate-in fade-in zoom-in-95 duration-500 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0d0d12] p-8 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <XCircle className="h-10 w-10 text-red-400" />
          </div>
          <p className="mt-5 text-[16px] font-bold">{errorMsg}</p>
          <p className="mt-2 text-[13px] text-white/50">
            The link may have expired, already been used, or be invalid.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full border border-white/15 px-6 py-2.5 text-[13px] font-semibold text-white/80 transition hover:bg-white/[0.06]"
          >
            Go home
          </Link>
        </div>
      )}

      {/* ---- No token ---- */}
      {status === "no-token" && (
        <div className="animate-in fade-in zoom-in-95 duration-500 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0d0d12] p-8 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
          <Gift className="mx-auto h-10 w-10 text-white/30" />
          <p className="mt-4 text-[15px] font-semibold text-white/70">No token provided</p>
          <p className="mt-2 text-[13px] text-white/40">
            Use the link you received by email.
          </p>
        </div>
      )}

      {/* Keyframes for custom animations */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes scaleRing {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function RedeemPageFallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#06070d] px-4 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0d0d12] p-8 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-violet-400" />
        <p className="mt-4 text-[15px] font-semibold text-white/80">Loading…</p>
      </div>
    </div>
  );
}

export default function RedeemPage() {
  return (
    <Suspense fallback={<RedeemPageFallback />}>
      <RedeemPageContent />
    </Suspense>
  );
}
