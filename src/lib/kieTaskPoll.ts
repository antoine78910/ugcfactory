import type { KieMarketRecordInfo } from "@/lib/kieMarket";
import {
  extractKieMediaUrls,
  kieRecordStateIsFail,
  kieRecordStateIsSuccess,
} from "@/lib/kieMarket";

export type KiePollOutcome =
  | { kind: "processing" }
  | { kind: "success"; urls: string[] }
  | { kind: "fail"; message: string };

export function kieImageTaskPollOutcome(data: KieMarketRecordInfo): KiePollOutcome {
  const st = data.state;
  const stLower = String(st ?? "").toLowerCase().trim();

  if (kieRecordStateIsFail(st)) {
    return { kind: "fail", message: data.failMsg ?? "Task failed" };
  }

  const urls = extractKieMediaUrls(data);

  if (kieRecordStateIsSuccess(st)) {
    if (urls.length === 0) {
      return { kind: "processing" };
    }
    return { kind: "success", urls };
  }

  /**
   * Some KIE Market models (e.g. `topaz/image-upscale`) return a bare result object or omit `state`;
   * `normalizeKieMarketRecordData` then yields `state: "unknown"` even when output URLs are present.
   * Without this branch, polling never flips the row to `ready`.
   */
  if (urls.length > 0 && (stLower === "" || stLower === "unknown")) {
    return { kind: "success", urls };
  }

  return { kind: "processing" };
}
