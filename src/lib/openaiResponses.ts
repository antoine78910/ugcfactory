import OpenAI from "openai";
import { requireEnv } from "@/lib/env";

/** Default for all `/api/gpt/*` routes unless `opts.model` or `OPENAI_MODEL` overrides. */
export const OPENAI_DEFAULT_MODEL = "gpt-5.2";

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

  const text = (resp as any).output_text as string | undefined;
  if (!text) {
    throw new Error("OpenAI response missing output_text.");
  }

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

  const text = (resp as any).output_text as string | undefined;
  if (!text) throw new Error("OpenAI response missing output_text.");
  return { text, raw: resp };
}

