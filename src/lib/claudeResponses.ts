import Anthropic from "@anthropic-ai/sdk";
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

type ImageBlock =
  | { type: "image"; source: { type: "url"; url: string } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function guessMediaType(url: string, contentType: string | null): string {
  const ct = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (ALLOWED_MEDIA_TYPES.has(ct)) return ct;
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

async function toImageBlock(rawUrl: string): Promise<ImageBlock | null> {
  const u = (rawUrl ?? "").trim();
  if (!u) return null;

  if (/^https:\/\//i.test(u)) {
    return { type: "image", source: { type: "url", url: u } };
  }

  if (/^http:\/\//i.test(u)) {
    const httpsUrl = u.replace(/^http:\/\//i, "https://");
    try {
      const probe = await fetch(httpsUrl, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
      if (probe.ok) {
        return { type: "image", source: { type: "url", url: httpsUrl } };
      }
    } catch { /* HTTPS upgrade failed, fall through to base64 */ }

    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 20_000_000) return null;
      const mediaType = guessMediaType(u, res.headers.get("content-type"));
      return { type: "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } };
    } catch {
      return null;
    }
  }

  return null;
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

  const imageResults = await Promise.all(opts.imageUrls.slice(0, 12).map(toImageBlock));
  for (const block of imageResults) {
    if (block) contentBlocks.push(block);
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

