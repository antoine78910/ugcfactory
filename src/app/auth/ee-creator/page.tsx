"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function takeHandoffToken(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  const token = new URLSearchParams(hash).get("ee_token");
  if (!token) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return token;
}

export default function EeCreatorCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = takeHandoffToken();
      if (!token) {
        router.replace("/signin");
        return;
      }
      try {
        const res = await fetch("/api/auth/ee-creator", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          if (!cancelled) {
            setError(
              body?.error === "not_creator"
                ? "This Ecom Efficiency account is not a creator account."
                : "Could not open Youry with your creator account.",
            );
          }
          return;
        }
        if (!cancelled) router.replace("/workflow");
      } catch {
        if (!cancelled) setError("Could not open Youry with your creator account.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#06070d] px-6 text-white">
      <div className="max-w-md text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold">Sign-in failed</h1>
            <p className="mt-2 text-sm text-white/60">{error}</p>
            <a className="mt-4 inline-block text-sm text-violet-200 underline" href="/signin">
              Back to sign in
            </a>
          </>
        ) : (
          <p className="text-sm text-white/60">Opening Youry as a creator…</p>
        )}
      </div>
    </main>
  );
}
