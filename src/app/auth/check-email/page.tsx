import Link from "next/link";
import Image from "next/image";
import { Mail } from "lucide-react";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const raw = sp.email;
  const email = typeof raw === "string" ? raw.trim() : "";

  return (
    <div className="min-h-[100dvh] min-h-screen overflow-x-hidden bg-[#050507] text-white">
      <div
        className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[min(420px,70vh)] w-[min(100vw,900px)] max-w-[100vw] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[100px] sm:h-[520px] sm:blur-[140px]"
        aria-hidden
      />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] min-h-screen w-full max-w-3xl items-center justify-center px-4 py-10 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:px-5">
        <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl sm:rounded-3xl sm:p-10">
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

          <div className="mt-8 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-500/10">
              <Mail className="h-6 w-6 text-violet-200" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Confirm your email</h1>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                We just sent you a confirmation link. Click it to activate your account.
              </p>
              {email ? (
                <p className="mt-4 text-sm text-white/70">
                  Sent to{" "}
                  <span className="rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[13px] text-white/85">
                    {email}
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link
              href="/signin"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              I confirmed — sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-violet-200/40 bg-violet-400 px-4 text-sm font-semibold text-black shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]"
            >
              Use a different email
            </Link>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-white/45">
            Can’t find it? Check spam/promotions and make sure you typed the correct email address.
          </p>
        </div>
      </main>
    </div>
  );
}

