import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "@/lib/env";

export type ClaudeModel = "claude-3-5-sonnet-20241022";

const DEFAULT_MODEL: ClaudeModel = "claude-3-5-sonnet-20241022";

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

export async function claudeMessagesTextWithImages(opts: {
  system?: string;
  user: string;
  imageUrls: string[];
  model?: ClaudeModel;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });

  const contentBlocks: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } }> = [
    { type: "text", text: opts.user },
  ];

  for (const url of opts.imageUrls.slice(0, 12)) {
    const u = (url ?? "").trim();
    if (!u) continue;
    contentBlocks.push({ type: "image", source: { type: "url", url: u } });
  }

  const message = await client.messages.create({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [
      {
        role: "user",
        content: contentBlocks,
      },
    ],
  });

  const text = extractTextFromAnthropicMessage(message);
  if (!text) throw new Error("Claude returned no text.");
  return text;
}

