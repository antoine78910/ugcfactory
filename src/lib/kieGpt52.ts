import { requireEnv } from "@/lib/env";

const API_BASE = "https://api.kie.ai";

function getKieApiKey() {
  return requireEnv("KIE_API_KEY");
}

export type KieGpt52Role = "developer" | "system" | "user" | "assistant" | "tool";

export type KieGpt52Message =
  | {
      role: KieGpt52Role;
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    }
  | { role: "assistant"; content: string };

type KieGpt52Request = {
  messages: Array<{
    role: KieGpt52Role;
    content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
  }>;
  reasoning_effort?: "low" | "high";
  tools?: Array<{ type: "function"; function: { name: "web_search" } }>;
};

type KieGpt52Response = {
  id: string;
  object: "chat.completion" | string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export async function kieGpt52Chat(req: KieGpt52Request) {
  const apiKey = getKieApiKey();
  const res = await fetch(`${API_BASE}/gpt-5-2/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
    cache: "no-store",
  });

  const text = await res.text();
  let json: KieGpt52Response | null = null;
  try {
    json = JSON.parse(text) as KieGpt52Response;
  } catch {
    // ignore
  }

  if (!res.ok || !json?.choices?.[0]?.message?.content) {
    const msg =
      (json as any)?.error?.message ??
      (json as any)?.message ??
      (json as any)?.msg ??
      text?.slice(0, 500) ??
      `HTTP ${res.status}`;
    throw new Error(`KIE GPT-5-2 failed: HTTP ${res.status} / ${String(msg)}`);
  }

  return {
    content: json.choices[0].message.content,
    usage: json.usage,
    raw: json,
  };
}

