export const runtime = "nodejs";
/** Allow long GPT + extract chains (raise on Vercel Pro / self-hosted as needed). */
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createInternalFetchFromRequest } from "@/lib/linkToAd/internalFetch";
import { runInitialPipeline } from "@/lib/linkToAd/runInitialPipeline";

type Body = {
  storeUrl?: string;
  neutralUploadUrl?: string | null;
  generationMode?: "automatic" | "custom_ugc";
  customUgcIntent?: string;
  aiProvider?: "gpt" | "claude";
  videoDurationSeconds?: number;
};

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const storeUrl = typeof body?.storeUrl === "string" ? body.storeUrl.trim() : "";
  if (!storeUrl || !/^https?:\/\//i.test(storeUrl)) {
    return NextResponse.json({ error: "Missing or invalid `storeUrl` (must start with http(s)://)." }, { status: 400 });
  }

  const neutralUploadUrl =
    body?.neutralUploadUrl === null || body?.neutralUploadUrl === undefined
      ? null
      : typeof body.neutralUploadUrl === "string"
        ? body.neutralUploadUrl.trim() || null
        : null;

  const generationMode = body?.generationMode === "custom_ugc" ? "custom_ugc" : "automatic";
  const customUgcIntent = typeof body?.customUgcIntent === "string" ? body.customUgcIntent.trim() : "";
  const aiProvider: "gpt" | "claude" = body?.aiProvider === "gpt" ? "gpt" : "claude";

  const f = createInternalFetchFromRequest(req);
  const result = await runInitialPipeline(f, {
    storeUrl,
    neutralUploadUrl,
    generationMode,
    customUgcIntent,
    aiProvider,
    videoDurationSeconds: body?.videoDurationSeconds,
  });

  if (result.ok === false) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.runId ? { runId: result.runId } : {}),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    runId: result.runId,
    scriptsStepOk: result.scriptsStepOk,
    ...(result.scriptsError ? { scriptsError: result.scriptsError } : {}),
  });
}
