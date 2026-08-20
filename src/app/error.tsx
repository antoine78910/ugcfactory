"use client";

import { useEffect } from "react";

/**
 * App Router segment error UI. ChunkLoadError after deploy is handled by
 * `ChunkLoadRecovery` (auto-reload); this covers other client exceptions.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  const looksLikeChunk =
    error?.name === "ChunkLoadError" ||
    /ChunkLoadError|Failed to load chunk|Loading chunk/i.test(error?.message ?? "");

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 bg-[#050507] px-6 text-center text-white">
      <h1 className="text-xl font-semibold tracking-tight">
        {looksLikeChunk ? "App updated" : "Something went wrong"}
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-white/55">
        {looksLikeChunk
          ? "A new version was deployed. Reload to load the latest files."
          : "A client error stopped this page. Try again, or reload if it persists."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Reload page
        </button>
        {!looksLikeChunk ? (
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/[0.06]"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
