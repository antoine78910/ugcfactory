"use client";

import { useEffect } from "react";

const RELOAD_KEY = "youry_chunk_reload_at";
const RELOAD_COOLDOWN_MS = 20_000;

function isChunkLoadFailure(message: string, name?: string): boolean {
  if (name === "ChunkLoadError") return true;
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|Loading CSS chunk/i.test(
    message,
  );
}

function reloadOnce(reason: string) {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* private mode — still attempt one reload */
  }
  console.warn("[youry] stale JS chunk after deploy, reloading once:", reason);
  window.location.reload();
}

/**
 * After a Vercel/Railway deploy, open tabs keep HTML that points at deleted
 * `/_next/static/chunks/*` files → ChunkLoadError + the generic Next.js
 * "Application error: a client-side exception has occurred".
 * One hard reload usually picks up the new build.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const msg = event.message || (event.error instanceof Error ? event.error.message : "");
      const name = event.error instanceof Error ? event.error.name : undefined;
      if (isChunkLoadFailure(msg, name)) reloadOnce(msg);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? "");
      const name = reason instanceof Error ? reason.name : undefined;
      if (isChunkLoadFailure(msg, name)) reloadOnce(msg);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
