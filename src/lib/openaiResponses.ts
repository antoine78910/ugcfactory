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

