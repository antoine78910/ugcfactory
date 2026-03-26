import type { SupabaseClient } from "@supabase/supabase-js";
import { kieMarketRecordInfo } from "@/lib/kieMarket";
import { kieImageTaskPollOutcome } from "@/lib/kieTaskPoll";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";
import { logGenerationFailure, userFacingProviderErrorOrDefault } from "@/lib/generationUserMessage";
import { isPiapiTaskId, piapiGetSeedanceTask, piapiTaskStatusToLegacy } from "@/lib/piapiSeedance";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

/** DB rows we still poll until Kie/PiAPI reports terminal state. */
export const STUDIO_GENERATION_IN_PROGRESS_STATUSES = [
  "processing",
  "generating",
  "pending",
  "queued",
] as const;

function isStudioGenerationInProgressStatus(s: string): boolean {
  return (STUDIO_GENERATION_IN_PROGRESS_STATUSES as readonly string[]).includes(s);
}

const STUDIO_MEDIA_BUCKET = "studio-media";

function guessExtensionFromUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  const lower = u.toLowerCase();
  if (lower.includes(".mp4")) return ".mp4";
  if (lower.includes(".mov")) return ".mov";
  if (lower.includes(".webm")) return ".webm";
  if (lower.includes(".png")) return ".png";
  if (lower.includes(".webp")) return ".webp";
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return ".jpg";
  return "";
}

function guessExtensionFromContentType(contentType: string | null): string {
  const ct = (contentType ?? "").toLowerCase();
  if (!ct) return "";
  const map: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/jpeg": ".jpg",
  };
  return map[ct] ?? "";
}

async function persistStudioMediaUrls(opts: {
  userId: string;
  rowId: string;
  urls: string[];
}): Promise<string[] | null> {
  const admin = createSupabaseServiceClient();
  if (!admin) {
    console.warn("[persistStudioMedia] No admin client (SUPABASE_SERVICE_ROLE_KEY missing?) — skipping persistence");
    return null;
  }

  const out: string[] = [];
  for (let i = 0; i < opts.urls.length; i++) {
    const src = (opts.urls[i] ?? "").trim();
    if (!src || !/^https?:\/\//i.test(src)) continue;

    try {
      console.log(`[persistStudioMedia] Downloading ${src.slice(0, 120)}…`);
      const res = await fetch(src, { cache: "no-store" });
      if (!res.ok) {
        console.warn(`[persistStudioMedia] Download failed: HTTP ${res.status} for ${src.slice(0, 120)}`);
        continue;
      }
      const bytes = await res.arrayBuffer();
      const buffer = Buffer.from(bytes);
      if (buffer.length === 0) {
        console.warn("[persistStudioMedia] Downloaded 0 bytes — skipping");
        continue;
      }

      const ct = res.headers.get("content-type") ?? "";
      const ext = guessExtensionFromContentType(ct) || guessExtensionFromUrl(src) || "";
      const filename = `${crypto.randomUUID()}${ext}`;
      const storagePath = `${opts.userId}/${opts.rowId}/${i + 1}-${filename}`;

      console.log(`[persistStudioMedia] Uploading ${(buffer.length / 1024).toFixed(0)} KB → ${STUDIO_MEDIA_BUCKET}/${storagePath}`);

      const { data, error } = await admin.storage.from(STUDIO_MEDIA_BUCKET).upload(storagePath, buffer, {
        contentType: ct || undefined,
        upsert: false,
      });
      if (error) {
        console.error(`[persistStudioMedia] Upload error:`, error.message ?? error);
        continue;
      }
      if (!data?.path) {
        console.warn("[persistStudioMedia] Upload returned no path");
        continue;
      }

      const {
        data: { publicUrl },
      } = admin.storage.from(STUDIO_MEDIA_BUCKET).getPublicUrl(data.path);
      console.log(`[persistStudioMedia] ✓ Persisted → ${publicUrl?.slice(0, 120)}`);
      if (publicUrl) out.push(publicUrl);
    } catch (err) {
      console.error(`[persistStudioMedia] Exception for ${src.slice(0, 80)}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[persistStudioMedia] row=${opts.rowId} persisted=${out.length}/${opts.urls.length}`);
  return out.length ? out : null;
}

/**
 * Poll Kie for one processing row and persist success/failure. Does not set credits_refund_hint_sent;
 * use sweepStudioRefundHints after so the client can grant credits once.
 */
export async function pollStudioGenerationRow(
  row: StudioGenerationRow,
  personalApiKey: string | undefined,
  piapiApiKey: string | undefined,
  supabase: SupabaseClient,
): Promise<void> {
  const status = String(row.status ?? "").toLowerCase();
  if (!isStudioGenerationInProgressStatus(status)) return;

  const kieKey = row.uses_personal_api ? personalApiKey?.trim() || undefined : undefined;

  let out: { kind: "processing" | "success" | "fail"; urls?: string[]; message?: string };
  if ((row.provider ?? "").toLowerCase() === "piapi" || isPiapiTaskId(row.external_task_id)) {
    /** Prefer user PiAPI key when present; otherwise platform key (piapiGetSeedanceTask fallback). */
    const raw = await piapiGetSeedanceTask(row.external_task_id, piapiApiKey?.trim() || undefined);
    const mapped = piapiTaskStatusToLegacy(raw);
    if (mapped.status === "IN_PROGRESS") out = { kind: "processing" };
    else if (mapped.status === "SUCCESS") out = { kind: "success", urls: mapped.response };
    else out = { kind: "fail", message: mapped.error_message ?? "PiAPI task failed" };
  } else {
    /**
     * Platform jobs: always use platform KIE key (override undefined).
     * Personal jobs: use browser key when present; if missing, fall back to platform (fixes mis-flagged rows).
     */
    const raw = await kieMarketRecordInfo(row.external_task_id, kieKey);
    out = kieImageTaskPollOutcome(raw);
  }

  if (out.kind === "processing") return;

  if (out.kind === "success") {
    const persisted = await persistStudioMediaUrls({
      userId: row.user_id,
      rowId: row.id,
      urls: out.urls ?? [],
    });
    const { error } = await supabase
      .from("studio_generations")
      .update({
        status: "ready",
        result_urls: persisted ?? out.urls,
        error_message: null,
      })
      .eq("id", row.id);
    if (error) throw error;
    return;
  }

  const rawFail = out.message ?? "Generation failed";
  logGenerationFailure("studioGenerationsPoll", rawFail, {
    rowId: row.id,
    kind: row.kind,
    externalTaskId: row.external_task_id,
    provider: row.provider,
  });

  const { error } = await supabase
    .from("studio_generations")
    .update({
      status: "failed",
      error_message: userFacingProviderErrorOrDefault(rawFail, "Generation failed"),
      result_urls: null,
    })
    .eq("id", row.id);
  if (error) throw error;
}

export async function sweepStudioRefundHints(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
): Promise<{ jobId: string; credits: number }[]> {
  const { data, error } = await supabase
    .from("studio_generations")
    .select("id, credits_charged")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("status", "failed")
    .eq("credits_refund_hint_sent", false)
    .gt("credits_charged", 0);

  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const hints: { jobId: string; credits: number }[] = [];
  for (const row of rows) {
    const { data: updated, error: upErr } = await supabase
      .from("studio_generations")
      .update({ credits_refund_hint_sent: true })
      .eq("id", row.id)
      .eq("user_id", userId)
      .eq("credits_refund_hint_sent", false)
      .select("id")
      .maybeSingle();

    if (upErr) throw upErr;
    if (updated) hints.push({ jobId: row.id, credits: row.credits_charged });
  }

  return hints;
}
