import { kieMarketRecordInfo } from "@/lib/kieMarket";
import { kieImageTaskPollOutcome } from "@/lib/kieTaskPoll";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Block until a Kie Market image task finishes or times out.
 */
export async function pollKieMarketImageTaskForUrls(opts: {
  taskId: string;
  personalApiKey?: string;
  maxWaitMs?: number;
  pollIntervalMs?: number;
}): Promise<string[]> {
  const maxWait = opts.maxWaitMs ?? 180_000;
  const interval = opts.pollIntervalMs ?? 2500;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const data = await kieMarketRecordInfo(opts.taskId, opts.personalApiKey);
    const outcome = kieImageTaskPollOutcome(data);
    if (outcome.kind === "success") return outcome.urls;
    if (outcome.kind === "fail") throw new Error(outcome.message);
    await sleep(interval);
  }

  throw new Error("Image generation timed out. Check the task id in Kie Market or try again.");
}
