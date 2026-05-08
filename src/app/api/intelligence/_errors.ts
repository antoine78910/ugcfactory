import { NextResponse } from "next/server";
import { TrendTrackError } from "@/lib/trendtrack";
import { getStale } from "@/lib/trendtrackCache";

export type StructuredError = {
  error: string;
  code: "auth" | "rate_limit" | "not_found" | "server" | "unknown";
  retryAfterSec?: number;
};

function safeClientErrorMessage(code: StructuredError["code"]): string {
  switch (code) {
    case "auth":
      return "Data provider key invalid.";
    case "rate_limit":
      return "Rate-limited. Try again shortly.";
    case "not_found":
      return "No data found.";
    case "server":
      return "Provider temporarily unavailable.";
    default:
      return "Network error";
  }
}

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
      error: safeClientErrorMessage(err.code),
      code: err.code,
      retryAfterSec: err.retryAfterSec,
    };
    return NextResponse.json(body, { status: err.status });
  }
  return NextResponse.json(
    { error: safeClientErrorMessage("unknown"), code: "unknown" } satisfies StructuredError,
    { status: 502 }
  );
}
