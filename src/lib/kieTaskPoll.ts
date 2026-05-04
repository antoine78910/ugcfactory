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
      /**
       * Provider marked success but no URL was parsed (unexpected payload shape).
       * Returning `processing` would leave Studio / admin stuck forever; fail loudly so polling stops.
       */
      return {
        kind: "fail",
        message:
          "Upscale finished on the provider but no output URL was returned. If this persists, contact support with the task id.",
      };
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
