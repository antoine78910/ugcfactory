export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { persistNanoBananaCallback } from "@/lib/storage";

type CallbackPayload = {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
    info?: {
      resultImageUrl?: string;
    };
  };
};

export async function POST(req: Request) {
  let payload: CallbackPayload;
  try {
    payload = (await req.json()) as CallbackPayload;
  } catch {
    return NextResponse.json({ status: "received" }, { status: 200 });
  }

  const taskId = payload?.data?.taskId;
  if (typeof taskId === "string" && taskId.length > 0) {
    try {
      await persistNanoBananaCallback(taskId, payload);
    } catch {
      // Keep callback handler best-effort; never block response.
    }
  }

  return NextResponse.json({ status: "received" }, { status: 200 });
}

