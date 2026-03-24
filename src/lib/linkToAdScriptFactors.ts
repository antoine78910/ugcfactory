/** Shared parsing / composition for Link to Ad “angle factor” UI (projects + studio). */

export type ScriptFactorBlocks = {
  hook: string;
  problem: string;
  avatar: string;
  benefits: string;
  proof: string;
  offer: string;
  cta: string;
  tone: string;
};

export const EMPTY_SCRIPT_FACTORS: ScriptFactorBlocks = {
  hook: "",
  problem: "",
  avatar: "",
  benefits: "",
  proof: "",
  offer: "",
  cta: "",
  tone: "",
};

function stripScriptOptionPrefix(raw: string): string {
  return raw.replace(/^\s*SCRIPT\s+OPTION\s*\d+\b\s*/i, "").trim();
}

function peelAngleHeadline(block: string): { body: string; headline: string } {
  const t = block.replace(/\r\n/g, "\n").trim();
  const m = t.match(/^\s*ANGLE_HEADLINE\s*:\s*(.+)$/im);
  if (!m) return { body: t, headline: "" };
  const headline = m[1].replace(/\s+/g, " ").trim();
  const body = t.replace(/^\s*ANGLE_HEADLINE\s*:\s*.+$/im, "").replace(/^\s*\n+/, "").trim();
  return { body, headline };
}

/** Raw angle chunk from storage → body for factor editor (no SCRIPT OPTION / headline line). */
export function angleBlockForEditing(raw: string): { editable: string; headline: string } {
  const stripped = stripScriptOptionPrefix(raw);
  const { body, headline } = peelAngleHeadline(stripped);
  return { editable: body, headline };
}

type UgcFrameworkSec = "HOOK" | "PROBLEM" | "SOLUTION" | "CTA" | "VIDEO_METADATA";

function spokenLinesFromSection(bodyLines: string[]): string {
  const joined = bodyLines.join("\n").trim();
  if (!joined) return "";
  const quotes = [...joined.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim()).filter(Boolean);
  if (quotes.length) return quotes.join(" ");
  return joined
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseVideoMetadataFieldLines(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /^\s*([a-z][a-z0-9_]*)\s*[:：—\-]\s*(.+)$/i;
  for (const line of lines) {
    const m = line.trim().match(re);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].replace(/\s+/g, " ").trim();
    if (!v) continue;
    out[k] = out[k] ? `${out[k]} · ${v}` : v;
  }
  return out;
}

function tryParseUgcScriptFrameworkV4(text: string, headlineHint: string): ScriptFactorBlocks | null {
  const norm = text.replace(/\r\n/g, "\n");
  const buf: Record<UgcFrameworkSec, string[]> = {
    HOOK: [],
    PROBLEM: [],
    SOLUTION: [],
    CTA: [],
    VIDEO_METADATA: [],
  };
  let current: UgcFrameworkSec | null = null;
  const lines = norm.split("\n");

  for (const raw of lines) {
    const tl = raw.trim();
    if (!tl) continue;

    if (/^ANGLE_HEADLINE\s*:/i.test(tl)) {
      current = null;
      continue;
    }

    const hm = tl.match(
      /^(?:[*•\-]\s*|\d+\.\s*)*(HOOK|PROBLEM|SOLUTION|CTA|VIDEO_METADATA)\b\s*(.*)$/i,
    );
    if (hm) {
      const sec = hm[1].toUpperCase() as UgcFrameworkSec;
      let rest = hm[2].trim();
      if (/^[—–\-]/.test(rest) && !rest.includes('"')) rest = "";
      current = sec;
      if (rest) buf[sec].push(rest);
      continue;
    }

    if (current) buf[current].push(raw.trimEnd());
  }

  const hasCore =
    buf.HOOK.length + buf.PROBLEM.length + buf.SOLUTION.length + buf.CTA.length > 0;
  if (!hasCore) return null;

  const meta = parseVideoMetadataFieldLines(buf.VIDEO_METADATA);
  const hookSpoken = spokenLinesFromSection(buf.HOOK);
  const problemSpoken = spokenLinesFromSection(buf.PROBLEM);
  const solutionSpoken = spokenLinesFromSection(buf.SOLUTION);
  const ctaSpoken = spokenLinesFromSection(buf.CTA);

  const hint = headlineHint.replace(/\s+/g, " ").trim();
  let hookOut = "";
  if (hint && hookSpoken) hookOut = `${hint}\n\n${hookSpoken}`.trim();
  else hookOut = hint || hookSpoken;

  const proofBits = [meta.props, meta.actions, meta.camera_style, meta.location].filter(Boolean);
  const toneBits = [meta.tone, meta.energy_level].filter(Boolean);

  return {
    hook: hookOut,
    problem: problemSpoken,
    avatar: meta.persona ?? "",
    benefits: solutionSpoken,
    proof: proofBits.join(" · "),
    offer: "",
    cta: ctaSpoken,
    tone: toneBits.join(", "),
  };
}

function videoMetadataLinesFromText(text: string): string[] {
  const m = text.match(
    /\bVIDEO_METADATA\b\s*\n([\s\S]*?)(?=\n\s*ANGLE_HEADLINE\b|\n\s*SCRIPT\s+OPTION\b|$)/i,
  );
  if (!m) return [];
  return m[1].split("\n");
}

function tryParseUgcQuotedGestures(text: string, headlineHint: string): ScriptFactorBlocks | null {
  const t = text.replace(/\r\n/g, "\n");
  const grab = (lab: string) => {
    const m = t.match(new RegExp(lab + String.raw`\b[\s\S]*?\([^)]*\)\s*"([^"]+)"`, "i"));
    return m?.[1]?.trim() ?? "";
  };
  const hookQ = grab("HOOK");
  const probQ = grab("PROBLEM");
  const solQ = grab("SOLUTION");
  const ctaQ = grab("CTA");
  if (!hookQ && !probQ && !solQ && !ctaQ) return null;

  const hint = headlineHint.replace(/\s+/g, " ").trim();
  const meta = parseVideoMetadataFieldLines(videoMetadataLinesFromText(t));
  const proofBits = [meta.props, meta.actions, meta.camera_style, meta.location].filter(Boolean);
  const toneBits = [meta.tone, meta.energy_level].filter(Boolean);

  return {
    hook: hint && hookQ ? `${hint}\n\n${hookQ}`.trim() : hint || hookQ,
    problem: probQ,
    avatar: meta.persona ?? "",
    benefits: solQ,
    proof: proofBits.join(" · "),
    offer: "",
    cta: ctaQ,
    tone: toneBits.join(", "),
  };
}

export function splitScriptFactorsForUi(script: string, headlineHint = ""): ScriptFactorBlocks {
  const hint = headlineHint.replace(/\s+/g, " ").trim();
  const clean = script.replace(/\r\n/g, "\n").trim();
  if (!clean && !hint) return { ...EMPTY_SCRIPT_FACTORS };

  if (clean) {
    const v4 = tryParseUgcScriptFrameworkV4(clean, hint);
    if (v4) {
      const hasAny = Object.values(v4).some((v) => String(v).trim().length > 0);
      if (hasAny) {
        if (!v4.hook.trim() && hint) v4.hook = hint;
        return v4;
      }
    }
    const quoted = tryParseUgcQuotedGestures(clean, hint);
    if (quoted) {
      const hasAny = Object.values(quoted).some((v) => String(v).trim().length > 0);
      if (hasAny) {
        if (!quoted.hook.trim() && hint) quoted.hook = hint;
        return quoted;
      }
    }
  }

  const linePatterns: { re: RegExp; slot: keyof ScriptFactorBlocks }[] = [
    { re: /^(hook|opening|intro)\s*[:：]\s*(.+)$/i, slot: "hook" },
    { re: /^(hook|opening|intro)\s+-\s+(.+)$/i, slot: "hook" },
    { re: /^(problem|pain\s*point|pain)\s*[:：]\s*(.+)$/i, slot: "problem" },
    { re: /^(problem|pain\s*point|pain)\s+-\s+(.+)$/i, slot: "problem" },
    { re: /^(avatar|audience|target)\s*[:：]\s*(.+)$/i, slot: "avatar" },
    { re: /^(avatar|audience|target)\s+-\s+(.+)$/i, slot: "avatar" },
    { re: /^(benefits?|value|outcomes?)\s*[:：]\s*(.+)$/i, slot: "benefits" },
    { re: /^(benefits?|value|outcomes?)\s+-\s+(.+)$/i, slot: "benefits" },
    { re: /^(proof|credibility|social\s*proof)\s*[:：]\s*(.+)$/i, slot: "proof" },
    { re: /^(proof|credibility|social\s*proof)\s+-\s+(.+)$/i, slot: "proof" },
    { re: /^(offer|deal|promo)\s*[:：]\s*(.+)$/i, slot: "offer" },
    { re: /^(offer|deal|promo)\s+-\s+(.+)$/i, slot: "offer" },
    { re: /^(cta|call\s*to\s*action)\s*[:：]\s*(.+)$/i, slot: "cta" },
    { re: /^(cta|call\s*to\s*action)\s+-\s+(.+)$/i, slot: "cta" },
    { re: /^(tone|style|voice)\s*[:：]\s*(.+)$/i, slot: "tone" },
    { re: /^(tone|style|voice)\s+-\s+(.+)$/i, slot: "tone" },
  ];

  const fromLines: ScriptFactorBlocks = { ...EMPTY_SCRIPT_FACTORS };
  if (clean) {
    for (const line of clean.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      for (const { re, slot } of linePatterns) {
        const m = t.match(re);
        const v = m?.[2]?.trim();
        if (v) {
          fromLines[slot] = fromLines[slot] ? `${fromLines[slot]} ${v}` : v;
          break;
        }
      }
    }
  }

  const anyFromLines = Object.values(fromLines).some(Boolean);
  if (anyFromLines) {
    if (!fromLines.hook.trim() && hint) fromLines.hook = hint;
    return fromLines;
  }

  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);
  const joined = lines.join(" ");
  const pick = (re: RegExp): string => {
    const m = joined.match(re);
    return (m?.[1] ?? "").trim();
  };
  const hook = pick(/\b(?:hook|opening|intro)\s*[:\-]\s*(.+?)(?=\s+\b(?:problem|pain|avatar|audience|benefit|proof|offer|cta|call to action|tone)\b\s*[:\-]|$)/i);
  const problem = pick(/\b(?:problem|pain point|pain)\s*[:\-]\s*(.+?)(?=\s+\b(?:avatar|audience|benefit|proof|offer|cta|call to action|tone)\b\s*[:\-]|$)/i);
  const avatar = pick(/\b(?:avatar|audience|target)\s*[:\-]\s*(.+?)(?=\s+\b(?:benefit|proof|offer|cta|call to action|tone)\b\s*[:\-]|$)/i);
  const benefits = pick(/\b(?:benefit|value|outcome)\s*[:\-]\s*(.+?)(?=\s+\b(?:proof|offer|cta|call to action|tone)\b\s*[:\-]|$)/i);
  const proof = pick(/\b(?:proof|credibility|social proof)\s*[:\-]\s*(.+?)(?=\s+\b(?:offer|cta|call to action|tone)\b\s*[:\-]|$)/i);
  const offer = pick(/\b(?:offer|deal|promo)\s*[:\-]\s*(.+?)(?=\s+\b(?:cta|call to action|tone)\b\s*[:\-]|$)/i);
  const cta = pick(/\b(?:cta|call to action)\s*[:\-]\s*(.+?)(?=\s+\b(?:tone)\b\s*[:\-]|$)/i);
  const tone = pick(/\b(?:tone|style|voice)\s*[:\-]\s*(.+?)$/i);

  if (hook || problem || avatar || benefits || proof || offer || cta || tone) {
    const out = { hook, problem, avatar, benefits, proof, offer, cta, tone };
    if (!out.hook && hint) out.hook = hint;
    return out;
  }

  const order: (keyof ScriptFactorBlocks)[] = ["hook", "problem", "avatar", "benefits", "proof", "offer", "cta", "tone"];
  const paras = clean.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (paras.length >= 2) {
    const out = { ...EMPTY_SCRIPT_FACTORS };
    const seq = hint ? [hint, ...paras] : paras;
    for (let i = 0; i < order.length && i < seq.length; i++) {
      out[order[i]] = seq[i];
    }
    return out;
  }

  if (clean.length > 0) {
    return { ...EMPTY_SCRIPT_FACTORS, hook: hint ? `${hint}\n\n${clean}`.trim() : clean };
  }

  return { ...EMPTY_SCRIPT_FACTORS, hook: hint };
}

export function composeScriptFromFactors(parts: ScriptFactorBlocks): string {
  return [
    parts.hook.trim() ? `Hook: ${parts.hook.trim()}` : "",
    parts.problem.trim() ? `Problem: ${parts.problem.trim()}` : "",
    parts.avatar.trim() ? `Avatar: ${parts.avatar.trim()}` : "",
    parts.benefits.trim() ? `Benefits: ${parts.benefits.trim()}` : "",
    parts.proof.trim() ? `Proof: ${parts.proof.trim()}` : "",
    parts.offer.trim() ? `Offer: ${parts.offer.trim()}` : "",
    parts.cta.trim() ? `CTA: ${parts.cta.trim()}` : "",
    parts.tone.trim() ? `Tone: ${parts.tone.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
