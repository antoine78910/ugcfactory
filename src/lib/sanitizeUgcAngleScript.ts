import { splitAllScriptOptions } from "@/lib/linkToAdUniverse";
import { normalizeUgcScriptVideoDurationSec } from "@/lib/ugcAiScriptBrief";

function stripScriptOptionHeaderLine(block: string): string {
  return block.replace(/^SCRIPT\s+OPTION\s*\d+\b\s*\n*/i, "").trim();
}

function isVoiceOrMetaPreambleLine(line: string): boolean {
  const t = line.trim();
  if (t === "" || /^---+$/.test(t)) return true;
  if (/^:+\s*$/.test(t)) return true;
  if (/^:?\s*\*\*VOICE\b/i.test(t)) return true;
  if (/\*\*VOICE\s+(PROFILE|SIGNATURE|PERFORMANCE)\*\*/i.test(t)) return true;
  if (/\bVOICE\s+(PROFILE|SIGNATURE|PERFORMANCE)\b/i.test(t)) return true;
  if (/\*\*VOICE\s+SIGNATURE\*\*.*Benefits:/i.test(t)) return true;
  if (/^:?\s*Benefits:/i.test(t)) return true;
  if (/^:?\s*\*\s*(Gender|Age|Accent|Timbre)\s*:/i.test(t)) return true;
  if (/\bAge:\s*\d/i.test(t) && /\bTone:\s*/i.test(t) && t.length < 220) return true;
  if (/^\*+\s*(Gender|Age|Accent|Timbre)\s*:/i.test(t)) return true;
  if (/^Tone:\s*/i.test(t) && /Honest|conversational|confessional|friendly|relatable/i.test(t)) return true;
  if (/^[•\-*]\s*(Gender|Age|Accent|Timbre|Tone|Energy|Pacing|Emotion)\b/i.test(t)) return true;
  if (/^\s*ANGLE_HEADLINE\s*:/i.test(t)) return true;
  return false;
}

function isScriptBodyStartLine(line: string): boolean {
  const t = line.trim();
  if (/^\(/.test(t)) return true;
  if (/^##\s*PART\s*\d+/i.test(t)) return true;
  if (/^\*\s*HOOK\b/i.test(t)) return true;
  if (/^HOOK\b/i.test(t)) return true;
  return false;
}

function stripLeadingVoicePreamble(body: string): string {
  const lines = body.split("\n");
  let cut = 0;
  for (let i = 0; i < lines.length && i < 50; i++) {
    const line = lines[i];
    if (isScriptBodyStartLine(line)) {
      cut = i;
      break;
    }
    if (isVoiceOrMetaPreambleLine(line)) {
      cut = i + 1;
      continue;
    }
    const t = line.trim();
    if (/^\([^)]*\)/.test(t) || /^"[^"]{8,}"/.test(t)) {
      cut = i;
      break;
    }
  }
  return lines.slice(cut).join("\n").trim();
}

function stripVideoMetadataAndAngleHeadline(s: string): string {
  const stopBefore = String.raw`(?=^\s*#{1,2}\s*PART\s*\d+\b|^\s*SCRIPT\s+OPTION\b|\Z)`;
  let t = s
    .replace(
      new RegExp(
        String.raw`\n\s*\*\*VIDEO_METADATA\*\*\s*\n([\s\S]*?)${stopBefore}`,
        "gim",
      ),
      "\n",
    )
    .replace(
      new RegExp(String.raw`\n\s*VIDEO_METADATA\b\s*\n([\s\S]*?)${stopBefore}`, "gim"),
      "\n",
    );
  t = t.replace(/^\s*ANGLE_HEADLINE\s*:.*$/gim, "").trim();
  return t;
}

/** Legacy whole-text regex cleanup when markers differ from our splitter. */
function sanitizeMonolithRegex(t0: string): string {
  let t = t0
    .replace(
      /(?:^|\n)\s*:?\s*\*?\*?VOICE\s+PROFILE\*?\*?[^\n]*\n[\s\S]*?(?=(?:^|\n)\s*(?:SCRIPT OPTION\b|##\s*PART\s*1\b|##\s*HOOK\b|\*?\s*HOOK\b|\*\*VIDEO_METADATA\*\*|^\s*---\s*$)|$)/gim,
      "\n",
    )
    .replace(
      /(?:^|\n)\s*:?\s*\*?\*?VOICE\s+SIGNATURE\*?\*?[^\n]*\n[\s\S]*?(?=(?:^|\n)\s*(?:SCRIPT OPTION\b|##\s*PART\s*1\b|##\s*HOOK\b|\*?\s*HOOK\b|\*\*VIDEO_METADATA\*\*|^\s*---\s*$)|$)/gim,
      "\n",
    )
    .replace(
      /(?:^|\n)\s*:?\s*\*?\*?VOICE\s+PERFORMANCE\*?\*?[^\n]*\n[\s\S]*?(?=(?:^|\n)\s*(?:SCRIPT OPTION\b|##\s*PART\s*1\b|##\s*HOOK\b|\*?\s*HOOK\b|\*\*VIDEO_METADATA\*\*|^\s*---\s*$)|$)/gim,
      "\n",
    )
    .replace(
      /\*\*VIDEO_METADATA\*\*\s*\n([\s\S]*?)(?=^\s*#{1,2}\s*PART\s*\d+\b|^SCRIPT OPTION\b|\Z)/gim,
      "",
    )
    .replace(/^\s*ANGLE_HEADLINE\s*:.*$/gim, "")
    .trim();
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function extract30sPartsIfPresent(inner: string): string {
  const m1 =
    /^\s*#{1,2}\s*PART\s*1\b[^\n]*\n[\s\S]*?(?=^\s*#{1,2}\s*PART\s*2\b)/gim.exec(inner);
  const m2 =
    /(^\s*#{1,2}\s*PART\s*2\b[^\n]*\n[\s\S]*?)(?=^\s*(?:\*\*)?VIDEO_METADATA\b|^\s*---+|^\s*SCRIPT\s+OPTION\b|\Z)/gim.exec(
      inner,
    );
  const p1 = m1?.[0]?.trim() ?? "";
  const p2 = m2?.[1]?.trim() ?? "";
  if (p1 && p2) return `${p1}\n\n${p2}`.trim();
  return inner;
}

/**
 * Keeps spoken script / scene blocks for Link to Ad: removes VOICE PROFILE / SIGNATURE / PERFORMANCE,
 * VIDEO_METADATA, ANGLE_HEADLINE. Handles `: **VOICE…**` and merged lines from sloppy model output.
 */
export function sanitizeUgcAngleScriptText(raw: string, videoDurationSecondsInput: unknown): string {
  const videoDurationSeconds = normalizeUgcScriptVideoDurationSec(videoDurationSecondsInput);
  const t0 = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!t0) return "";

  const hasScriptMarkers = /SCRIPT\s+OPTION\s*\d+/i.test(t0);
  const blocks = splitAllScriptOptions(t0);
  let main: string;

  if (blocks.length >= 1 && hasScriptMarkers) {
    const cleanedBlocks = blocks.map((block) => {
      let inner = stripScriptOptionHeaderLine(block);
      inner = stripLeadingVoicePreamble(inner);
      inner = stripVideoMetadataAndAngleHeadline(inner);
      inner = inner.trim();
      if (videoDurationSeconds === 30) {
        inner = extract30sPartsIfPresent(inner);
      }
      return inner.trim();
    });
    main = cleanedBlocks
      .map((b, i) => `SCRIPT OPTION ${i + 1}\n\n${b}`)
      .join("\n\n")
      .trim();
  } else {
    main = sanitizeMonolithRegex(t0);
    main = stripLeadingVoicePreamble(main);
    main = stripVideoMetadataAndAngleHeadline(main);
    if (videoDurationSeconds === 30) {
      main = extract30sPartsIfPresent(main);
    }
  }

  return main.replace(/\n{3,}/g, "\n\n").trim();
}
