/** Persisted Link to Ad Universe state (stored inside ugc_runs.extracted.__universe) */
export type LinkToAdUniverseSnapshotV1 = {
  v: 1;
  phase: "after_summary" | "after_scripts";
  cleanCandidate: { url: string; reason?: string } | null;
  fallbackImageUrl: string | null;
  confidence: string | null;
  neutralUploadUrl: string | null;
  summaryText: string;
  scriptsText: string;
  angleLabels: [string, string, string];
  selectedAngleIndex: number | null;
};

const FALLBACK_ANGLE_LABELS: [string, string, string] = [
  "Pain & urgency — stop the scroll with a relatable frustration.",
  "Trust & proof — calm objections and show why it works.",
  "Desire & transformation — lead with the main product benefit.",
];

/** Split GPT output into the 3 SCRIPT OPTION bodies (best-effort). */
export function splitScriptOptions(full: string): [string, string, string] {
  const text = full.replace(/\r\n/g, "\n");
  const markers = [
    text.search(/SCRIPT\s+OPTION\s*1\b/i),
    text.search(/SCRIPT\s+OPTION\s*2\b/i),
    text.search(/SCRIPT\s+OPTION\s*3\b/i),
  ];
  if (markers[0] === -1) {
    const third = Math.max(1, Math.floor(text.length / 3));
    return [text.slice(0, third), text.slice(third, third * 2), text.slice(third * 2)];
  }
  const ends = [...markers.slice(1), text.length];
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const start = markers[i];
    const end = i < 2 ? Math.max(start, markers[i + 1]) : text.length;
    out.push(start >= 0 ? text.slice(start, end).trim() : "");
  }
  return [out[0] || text, out[1] || "", out[2] || ""];
}

/** One-line-ish teaser from a script block: first spoken line after HOOK, else first quoted line. */
export function teaserFromScriptBlock(block: string, index: 0 | 1 | 2): string {
  const hookSpoken = block.match(/HOOK\s*[\s\S]*?\([^)]*\)\s*\n\s*"([^"]+)"/i);
  if (hookSpoken?.[1]) {
    const s = hookSpoken[1].trim();
    return s.length > 140 ? `${s.slice(0, 137)}…` : s;
  }
  const any = block.match(/"([^"]{10,200})"/);
  if (any?.[1]) {
    const s = any[1].trim();
    return s.length > 140 ? `${s.slice(0, 137)}…` : s;
  }
  return FALLBACK_ANGLE_LABELS[index];
}

export function deriveAngleLabelsFromScripts(scriptsText: string): [string, string, string] {
  const [a, b, c] = splitScriptOptions(scriptsText);
  return [
    teaserFromScriptBlock(a, 0),
    teaserFromScriptBlock(b, 1),
    teaserFromScriptBlock(c, 2),
  ];
}
