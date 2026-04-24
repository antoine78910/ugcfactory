import { NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";

const BREVO_BASE = "https://api.brevo.com/v3";

type Body = {
  category?: "feedback" | "feature" | "bug";
  message?: string;
  pagePath?: string;
};

function isFeedbackTableMissingError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message ?? "").toLowerCase();
  const code = String(err.code ?? "").toUpperCase();
  return code === "PGRST205" || msg.includes("feedback_submissions") && msg.includes("schema cache");
}

async function sendFeedbackEmail(opts: {
  fromEmail: string;
  category: string;
  message: string;
  pagePath: string;
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return;
  const toEmail = "anto.delbos@gmail.com";
  const fromEmail =
    process.env.BREVO_FEEDBACK_FROM_EMAIL?.trim() ||
    process.env.BREVO_SENDER_EMAIL?.trim() ||
    "app@youry.io";

  const html = `
    <h2>New app feedback</h2>
    <p><strong>Category:</strong> ${opts.category}</p>
    <p><strong>User:</strong> ${opts.fromEmail}</p>
    <p><strong>Page:</strong> ${opts.pagePath}</p>
    <p><strong>Message:</strong></p>
    <pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;background:#f6f6f7;padding:12px;border-radius:8px;">${opts.message}</pre>
  `;

  await fetch(`${BREVO_BASE}/smtp/email`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: "Youry feedback" },
      to: [{ email: toEmail }],
      replyTo: { email: opts.fromEmail || fromEmail },
      subject: `Youry feedback (${opts.category})`,
      htmlContent: html,
    }),
  }).catch(() => {
    /* non-blocking */
  });
}

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;
  const admin = createSupabaseServiceClient();

  const body = (await req.json().catch(() => ({}))) as Body;
  const category = (body.category ?? "feedback").trim();
  const message = (body.message ?? "").trim();
  const pagePath = (body.pagePath ?? "").trim() || "/app";
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const email = (await resolveAuthUserEmail(auth.user, admin)) ?? auth.user.email ?? "";

  const { error } = await auth.supabase.from("feedback_submissions").insert({
    user_id: auth.user.id,
    email: email || null,
    category,
    message,
    page_path: pagePath,
    status: "new",
  });
  if (error && !isFeedbackTableMissingError(error)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await sendFeedbackEmail({
    fromEmail: email || "unknown@youry.io",
    category,
    message,
    pagePath,
  });

  return NextResponse.json({ ok: true });
}

