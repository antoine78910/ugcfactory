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
  if (kieRecordStateIsFail(st)) {
    return { kind: "fail", message: data.failMsg ?? "Task failed" };
  }
  if (kieRecordStateIsSuccess(st)) {
    const urls = extractKieMediaUrls(data);
    if (urls.length === 0) {
      return { kind: "processing" };
    }
    return { kind: "success", urls };
  }
  return { kind: "processing" };
}
