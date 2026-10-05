export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { parseWorkflowAgentPlan } from "@/app/workflow/workflowAgentOps";
import { claudeMessagesText, claudeMessagesTextWithImages } from "@/lib/claudeResponses";
import { openaiResponsesText, openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type Body = {
  instruction?: string;
  html?: string;
  imageUrls?: string[];
  currentGraph?: unknown;
  model?: "claude-sonnet-4-5" | "gpt-5o";
  /** When true, the model should clear the canvas before rebuilding. */
  rebuild?: boolean;
};

const MAX_INSTRUCTION = 8_000;
const MAX_HTML = 60_000;

const DEVELOPER = [
  "You are a workflow canvas agent for Youry Workflow (React Flow).",
  "Return ONLY a JSON object: { \"summary\": string, \"ops\": WorkflowAgentOp[] }.",
  "No markdown fences, no prose outside JSON.",
  "",
  "Ops schema:",
  '- { "op":"clear_canvas" }',
  '- { "op":"add_node", "tempId":"n1", "factory":"adAsset"|"textPrompt"|"promptList"|"sticky", "kind"?: "image"|"video"|"motion"|"assistant"|"variation"|"upscale"|"website"|"videoMerge", "position":{"x":number,"y":number}, "data"?: object }',
  '- { "op":"patch_node", "nodeId":"…", "data": object }  // nodeId may be a tempId from add_node',
  '- { "op":"move_node", "nodeId":"…", "position":{"x":number,"y":number} }',
  '- { "op":"connect", "source":"…", "target":"…", "sourceHandle"?:string, "targetHandle"?:string }',
  '- { "op":"delete_nodes", "nodeIds":["…"] }',
  '- { "op":"align_grid", "nodeIds":["…"], "rows"?:number, "cols"?:number, "gap"?:number }',
  '- { "op":"run_node", "nodeId":"…" }',
  '- { "op":"run_from_here", "nodeId":"…" }',
  "",
  "Factory notes:",
  "- textPrompt data: { prompt: string }",
  "- promptList data: { label?: string, lines?: string[], mode?: \"prompts\"|\"results\" }",
  "- sticky data: { text: string }",
  "- adAsset data: { label?, prompt?, model?, aspectRatio?, resolution?, assistantVisionPreset?: \"image_to_json\"|\"video_to_prompt\" }",
  "- Image generators: kind \"image\". Video: \"video\". LLM helper: \"assistant\".",
  "",
  "Handles (defaults are fine if omitted):",
  "- image/variation/upscale sourceHandle \"generated\", targetHandle \"reference\"",
  "- video/motion/assistant usually \"out\" → \"in\"",
  "- textPrompt often feeds generators via \"out\" → target prompt/in handle",
  "",
  "Layout: space modules ~320px horizontally and ~260px vertically. Keep a readable left-to-right flow.",
  "If rebuilding from a screenshot or HTML, start with clear_canvas then add_node ops that recreate the visible structure and prompts.",
  "If editing an existing graph, prefer patch_node / move_node / connect / align_grid over clearing.",
  "Only emit run_node / run_from_here when the user explicitly asks to run or generate.",
  "Use tempIds like n1, n2 for new nodes and reference those tempIds in connect/patch/run ops.",
].join("\n");

function filterHttpsImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const u = typeof x === "string" ? x.trim() : "";
    if (!/^https:\/\//i.test(u)) continue;
    out.push(u);
    if (out.length >= 6) break;
  }
  return out;
}

function stripHeavyHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_HTML);
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  const htmlRaw = typeof body?.html === "string" ? body.html : "";
  const html = htmlRaw ? stripHeavyHtml(htmlRaw) : "";
  const imageUrls = filterHttpsImageUrls(body?.imageUrls);
  const model = body?.model === "gpt-5o" ? "gpt-5o" : "claude-sonnet-4-5";
  const rebuild = body?.rebuild === true;

  if (!instruction && !html && imageUrls.length === 0) {
    return NextResponse.json(
      { error: "Provide an instruction, HTML, and/or screenshot URL(s)." },
      { status: 400 },
    );
  }
  if (instruction.length > MAX_INSTRUCTION) {
    return NextResponse.json({ error: "Instruction too long." }, { status: 400 });
  }

  const userParts: string[] = [];
  if (rebuild) {
    userParts.push("Mode: REBUILD. Clear the canvas first, then recreate the workflow.");
  } else {
    userParts.push("Mode: EDIT. Prefer patching the existing graph unless a full rebuild is clearly needed.");
  }
  if (instruction) userParts.push(`User instruction:\n${instruction}`);
  if (html) userParts.push(`Page HTML (truncated / cleaned):\n${html}`);
  if (body?.currentGraph != null) {
    try {
      userParts.push(`Current canvas graph JSON:\n${JSON.stringify(body.currentGraph).slice(0, 40_000)}`);
    } catch {
      /* ignore */
    }
  }
  if (imageUrls.length > 0) {
    userParts.push(
      `There ${imageUrls.length === 1 ? "is 1 screenshot" : `are ${imageUrls.length} screenshots`} attached. Analyze layout, module types, and visible prompts, then emit ops to match them.`,
    );
  }

  const user = userParts.join("\n\n");

  try {
    let raw = "";
    if (imageUrls.length > 0) {
      if (model === "gpt-5o") {
        const { text } = await openaiResponsesTextWithImages({
          developer: DEVELOPER,
          userText: user,
          imageUrls,
          model: "gpt-5.2",
        });
        raw = text;
      } else {
        raw = await claudeMessagesTextWithImages({
          system: DEVELOPER,
          user,
          imageUrls,
          model: "claude-sonnet-4-5-20250929",
          maxTokens: 8192,
        });
      }
    } else if (model === "gpt-5o") {
      const { text } = await openaiResponsesText({
        developer: DEVELOPER,
        user,
        model: "gpt-5.2",
      });
      raw = text;
    } else {
      raw = await claudeMessagesText({
        system: DEVELOPER,
        user,
        model: "claude-sonnet-4-5-20250929",
        maxTokens: 8192,
      });
    }

    const plan = parseWorkflowAgentPlan(raw);
    if (!plan) {
      return NextResponse.json(
        { error: "Agent returned an unreadable plan.", raw: raw.slice(0, 2000) },
        { status: 502 },
      );
    }
    return NextResponse.json({ plan, raw: raw.slice(0, 4000) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
