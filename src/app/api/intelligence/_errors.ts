import { NextResponse } from "next/server";
import { TrendTrackError } from "@/lib/trendtrack";
import { getStale } from "@/lib/trendtrackCache";

export type StructuredError = {
  error: string;
  code: "auth" | "rate_limit" | "not_found" | "server" | "unknown";
  retryAfterSec?: number;
};

export async function respondTrendTrackError<T>(
  err: unknown,
  staleKey: string | null
): Promise<NextResponse> {
  if (err instanceof TrendTrackError) {
    if (err.code === "server" && staleKey) {
      const stale = await getStale<T>(staleKey);
      if (stale) {
        return NextResponse.json(
          { data: stale.data, staleAt: stale.staleAt },
          { status: 200, headers: { "x-intel-stale": "1" } }
        );
      }
    }
    const body: StructuredError = {
      error: err.message,
      code: err.code,
      retryAfterSec: err.retryAfterSec,
    };
    return NextResponse.json(body, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json(
    { error: message, code: "unknown" } satisfies StructuredError,
    { status: 502 }
  );
}
