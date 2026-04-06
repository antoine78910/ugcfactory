/** Parse PROMPT PART 1 / PART 2 from ugc-i2v-prompt model output (30s workflow). */
export function parseUgcI2v30sParts(raw: string): { part1: string; part2: string } | null {
  const t = raw.replace(/\r\n/g, "\n").trim();
  const m1 = /PROMPT\s+PART\s+1\s*([\s\S]*?)(?=PROMPT\s+PART\s+2\b)/i.exec(t);
  const m2 = /PROMPT\s+PART\s+2\s*([\s\S]*?)(?=FULL\s+SEQUENCE\b|$)/i.exec(t);
  const p1 = m1?.[1]?.trim();
  const p2 = m2?.[1]?.trim();
  if (!p1 || !p2) return null;
  return { part1: p1, part2: p2 };
}
