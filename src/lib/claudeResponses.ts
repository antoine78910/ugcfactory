import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { requireEnv } from "@/lib/env";

export type ClaudeModel = "claude-sonnet-4-5-20250929" | "claude-sonnet-4-6";

const DEFAULT_MODEL: ClaudeModel = "claude-sonnet-4-5-20250929";

function extractTextFromAnthropicMessage(message: any): string {
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const parts: string[] = [];
  for (const b of blocks) {
    if (b && b.type === "text" && typeof b.text === "string") {
      const t = b.text.trim();
      if (t) parts.push(t);
    }
  }
  return parts.join("").trim();
}

export async function claudeMessagesText(opts: {
  system?: string;
  user: string;
  model?: ClaudeModel;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: opts.user }],
      },
    ],
  });

  const text = extractTextFromAnthropicMessage(message);
  if (!text) throw new Error("Claude returned no text.");
  return text;
}

type ImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };

const FETCH_IMAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; UGC-Studio/1.0)",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
} as const;

/** Fetch remote image and emit Claude-safe JPEG (Anthropic rejects AVIF, many SVGs, wrong Content-Types, etc.). */
async function toImageBlock(rawUrl: string): Promise<ImageBlock | null> {
  let u = (rawUrl ?? "").trim();
  if (!u) return null;

  if (/^http:\/\//i.test(u)) {
    const upgraded = u.replace(/^http:\/\//i, "https://");
    try {
      const head = await fetch(upgraded, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
      if (head.ok) u = upgraded;
    } catch {
      /* keep http */
    }
  }

  if (!/^https?:\/\//i.test(u)) return null;

  try {
    const res = await fetch(u, {
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
      headers: FETCH_IMAGE_HEADERS,
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 25 * 1024 * 1024) return null;

    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;

    const maxSide = 4096;
    let pipeline = sharp(buf).rotate();
    if (meta.width > maxSide || meta.height > maxSide) {
      pipeline = sharp(buf).rotate().resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true });
    }

    const jpeg = await pipeline.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    if (jpeg.length === 0) return null;

    return {
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: jpeg.toString("base64"),
      },
    };
  } catch {
    return null;
  }
}

export async function claudeMessagesTextWithImages(opts: {
  system?: string;
  user: string;
  imageUrls: string[];
  model?: ClaudeModel;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });

  const contentBlocks: Array<{ type: "text"; text: string } | ImageBlock> = [
    { type: "text", text: opts.user },
  ];

  const requested = opts.imageUrls.slice(0, 12).map((x) => String(x).trim()).filter(Boolean);
  const imageResults = await Promise.all(requested.map(toImageBlock));
  let imageCount = 0;
  for (const block of imageResults) {
    if (block) {
      contentBlocks.push(block);
      imageCount += 1;
    }
  }
  if (requested.length > 0 && imageCount === 0) {
    throw new Error(
      "No page images could be sent to the vision model (unsupported format, blocked URL, or timeout). Try again or switch classify provider to GPT in settings if available.",
    );
  }

  const message = await client.messages.create({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [
      {
        role: "user",
        content: contentBlocks as any,
      },
    ],
  });

  const text = extractTextFromAnthropicMessage(message);
  if (!text) throw new Error("Claude returned no text.");
  return text;
}

