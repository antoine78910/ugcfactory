"use client";

import { useEffect, useState } from "react";

const HANDOFF_KEY = "ee_creator_handoff_token";
let handoffStarted = false;

function takeHandoffToken(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  const fromHash = new URLSearchParams(hash).get("ee_token");
  if (fromHash) {
    sessionStorage.setItem(HANDOFF_KEY, fromHash);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return fromHash;
  }
  return sessionStorage.getItem(HANDOFF_KEY);
}

export default function EeCreatorCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (handoffStarted) return;
    handoffStarted = true;
    void (async () => {
      const token = takeHandoffToken();
      if (!token) {
        window.location.replace("/signin");
        return;
      }
      try {
        const res = await fetch("/api/auth/ee-creator", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        sessionStorage.removeItem(HANDOFF_KEY);
        if (!res.ok) {
          handoffStarted = false;
          setError(
            body?.error === "not_creator"
              ? "This Ecom Efficiency account is not a creator account."
              : "Could not open Youry with your creator account.",
          );
          return;
        }
        window.location.replace("/workflow");
      } catch {
        handoffStarted = false;
        setError("Could not open Youry with your creator account.");
      }
    })();
  }, []);

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
