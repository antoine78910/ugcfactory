import type { KieMarketRecordInfo } from "@/lib/kieMarket";
import { parseKieResultMediaUrls } from "@/lib/kieMarket";

export type KiePollOutcome =
  | { kind: "processing" }
  | { kind: "success"; urls: string[] }
  | { kind: "fail"; message: string };

export function kieImageTaskPollOutcome(data: KieMarketRecordInfo): KiePollOutcome {
  const st = String(data.state ?? "").toLowerCase();
  if (st === "success") {
    const urls = parseKieResultMediaUrls(data.resultJson);
    return { kind: "success", urls };
  }
  if (st === "fail") {
    return { kind: "fail", message: data.failMsg ?? "Task failed" };
  }
  return { kind: "processing" };
}
