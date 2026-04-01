const WAVESPEED_CHAIN_PREFIX = "motion-translate";

export const WAVESPEED_PROVIDER = "wavespeed";
export const WAVESPEED_CHAIN_PROVIDER = "wavespeed-chain";

export function makeWaveSpeedMotionTranslateChainTaskId(motionTaskId: string, outputLanguage: string): string {
  return `${WAVESPEED_CHAIN_PREFIX}:${encodeURIComponent(motionTaskId)}:${encodeURIComponent(outputLanguage.trim())}`;
}

export function parseWaveSpeedMotionTranslateChainTaskId(
  raw: string,
): { motionTaskId: string; outputLanguage: string } | null {
  if (!raw.startsWith(`${WAVESPEED_CHAIN_PREFIX}:`)) return null;
  const rest = raw.slice(WAVESPEED_CHAIN_PREFIX.length + 1);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const motionTaskId = decodeURIComponent(rest.slice(0, sep));
  const outputLanguage = decodeURIComponent(rest.slice(sep + 1));
  if (!motionTaskId.trim() || !outputLanguage.trim()) return null;
  return { motionTaskId, outputLanguage };
}
