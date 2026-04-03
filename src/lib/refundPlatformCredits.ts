/**
 * After a platform-wallet debit, if generation fails (API error, poll timeout, plan upgrade message, etc.),
 * restore credits and keep `creditsRef` in sync for immediate re-tries.
 */
export function refundPlatformCredits(
  chargedAmount: number,
  grantCredits: (amount: number) => void,
  creditsRef?: { current: number },
): void {
  const n = Math.max(0, Number(chargedAmount) || 0);
  if (n <= 0) return;
  grantCredits(n);
  if (creditsRef) creditsRef.current += n;
}
