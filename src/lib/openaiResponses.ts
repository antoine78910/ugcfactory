import OpenAI from "openai";
import { requireEnv } from "@/lib/env";

/** Default for all `/api/gpt/*` routes unless `opts.model` or `OPENAI_MODEL` overrides. */
export const OPENAI_DEFAULT_MODEL = "gpt-5.2";

/**
 * With tools (e.g. web_search), some responses only populate `output[]` and leave `output_text` empty.
 * Also surfaces API-level `error` and text `refusal` parts.
 */
function extractTextFromOpenAIResponse(resp: unknown): string {
  if (!resp || typeof resp !== "object") {
    throw new Error("OpenAI response missing body.");
  }

  const r = resp as Record<string, unknown>;

  const apiErr = r.error;
  if (apiErr && typeof apiErr === "object") {
    const msg = (apiErr as { message?: unknown }).message;
    const code = (apiErr as { code?: unknown }).code;
    if (typeof msg === "string" && msg.trim()) {
      const prefix = typeof code === "string" && code.trim() ? `${code}: ` : "";
      throw new Error(`${prefix}${msg}`);
    }
  }

  const ot = r.output_text;
  if (typeof ot === "string" && ot.trim()) return ot.trim();

  const output = r.output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (o.type !== "message") continue;
      const content = o.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const p = part as Record<string, unknown>;
        if (p.type === "output_text" && typeof p.text === "string" && p.text.trim()) {
          chunks.push(p.text.trim());
        }
        if (p.type === "refusal") {
          const refusal = (p as { refusal?: unknown }).refusal;
          if (typeof refusal === "string" && refusal.trim()) {
            throw new Error(`OpenAI refused: ${refusal.trim()}`);
          }
        }
      }
    }
    const joined = chunks.join("\n").trim();
    if (joined) return joined;
  }

  throw new Error("OpenAI response missing output text.");
}

function getOpenAiApiKey() {
  return requireEnv("OPENAI_API_KEY");
}

function getOpenAiModel() {
  return process.env.OPENAI_MODEL && process.env.OPENAI_MODEL.length > 0
    ? process.env.OPENAI_MODEL
    : OPENAI_DEFAULT_MODEL;
}

/** Built-in Responses API tools (e.g. web search). See OpenAI `Tool` / web_search. */
export type OpenaiResponsesTool =
  | { type: "web_search" | "web_search_2025_08_26"; search_context_size?: "low" | "medium" | "high" }
  | { type: "web_search_preview" | "web_search_preview_2025_03_11" };

export async function openaiResponsesText(opts: {
  developer: string;
  user: string;
  model?: string;
  /** When set, passed to `responses.create` (e.g. `{ type: "web_search" }`). */
  tools?: OpenaiResponsesTool[];
}) {
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const model = opts.model ?? getOpenAiModel();

  const resp = await client.responses.create({
    model,
    input: [
      { role: "developer", content: opts.developer },
      { role: "user", content: opts.user },
    ],
    ...(opts.tools?.length ? { tools: opts.tools as unknown as OpenAI.Responses.ResponseCreateParams["tools"] } : {}),
  });

  const text = extractTextFromOpenAIResponse(resp);

  return {
    text,
    raw: resp,
  };
}

export async function openaiResponsesTextWithImages(opts: {
  developer: string;
  userText: string;
  imageUrls: string[];
  model?: string;
}) {
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const model = opts.model ?? getOpenAiModel();

  const content: any[] = [{ type: "input_text", text: opts.userText }];
  for (const u of opts.imageUrls.slice(0, 12)) {
    content.push({ type: "input_image", image_url: u, detail: "auto" });
  }

  const resp = await client.responses.create({
    model,
    input: [
      { role: "developer", content: opts.developer },
      { role: "user", content },
    ] as any,
  });

  const text = extractTextFromOpenAIResponse(resp);
  return { text, raw: resp };
}

