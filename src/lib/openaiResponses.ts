import OpenAI from "openai";
import { requireEnv } from "@/lib/env";

function getOpenAiApiKey() {
  return requireEnv("OPENAI_API_KEY");
}

function getOpenAiModel() {
  // user requested GPT-5.2 "normal"
  return process.env.OPENAI_MODEL && process.env.OPENAI_MODEL.length > 0
    ? process.env.OPENAI_MODEL
    : "gpt-5.2";
}

export async function openaiResponsesText(opts: {
  developer: string;
  user: string;
  model?: string;
}) {
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const model = opts.model ?? getOpenAiModel();

  const resp = await client.responses.create({
    model,
    input: [
      { role: "developer", content: opts.developer },
      { role: "user", content: opts.user },
    ],
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

