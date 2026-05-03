export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { claudeMessagesText } from "@/lib/claudeResponses";
import {
  getUserCreditBalance,
  refundUserCredits,
  spendUserCredits,
} from "@/lib/creditGrants";
import { isSubscriptionUnlimitedEmail } from "@/lib/allowedUsers";
import { parsePromptEnhanceSurface, promptEnhanceSystem } from "@/lib/promptEnhance";
import { PROMPT_ENHANCE_CREDITS } from "@/lib/pricing";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { getUserPlan } from "@/lib/supabase/getUserPlan";

const MAX_PROMPT = 12_000;

type Body = {
  prompt?: string;
  surface?: string;
};

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(auth.user, admin);

  const body = (await req.json().catch(() => null)) as Body | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const surface = parsePromptEnhanceSurface(body?.surface);

  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT) {
    return NextResponse.json({ error: "Prompt too long." }, { status: 400 });
  }

  const unlimited = isSubscriptionUnlimitedEmail(email);
  const planId = await getUserPlan(auth.user.id);
  const chargeFreeLedger = planId === "free" && !unlimited;

  if (!admin && chargeFreeLedger) {
    return NextResponse.json({ error: "Credits unavailable." }, { status: 503 });
  }

  let charged = 0;

  if (chargeFreeLedger && admin) {
    const { balance } = await getUserCreditBalance(admin, auth.user.id);
    if (balance < PROMPT_ENHANCE_CREDITS) {
      return NextResponse.json(
        { error: "Not enough credits.", balance },
        { status: 402 },
      );
    }
    charged = await spendUserCredits(admin, auth.user.id, PROMPT_ENHANCE_CREDITS);
    if (charged < PROMPT_ENHANCE_CREDITS) {
      return NextResponse.json({ error: "Not enough credits." }, { status: 402 });
    }
  }

  try {
    const enhanced = (
      await claudeMessagesText({
        system: promptEnhanceSystem(surface),
        user: prompt,
        model: "claude-opus-4-7",
        maxTokens: 2048,
      })
    ).trim();

    if (!enhanced) {
      throw new Error("Empty model response.");
    }

    let balance: number | undefined;
    if (admin && charged > 0) {
      balance = (await getUserCreditBalance(admin, auth.user.id)).balance;
    }

    return NextResponse.json({ enhanced, ...(balance !== undefined ? { balance } : {}) });
  } catch (err) {
    if (charged > 0 && admin) {
      await refundUserCredits(admin, auth.user.id, charged);
    }
    const message = err instanceof Error ? err.message : "Enhance failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
