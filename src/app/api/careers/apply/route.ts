export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { parseSmartShortFormVideoEditorApplicationForm } from "@/lib/careers/parseVideoEditorForm";
import { randomUUID } from "crypto";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const JOB_SLUG_MAX = 120;

const CREATIVE_JOB_SLUGS = new Set(["founding-creative"]);
const VIDEO_EDITOR_JOB_SLUGS = new Set([
  "smart-video-editor",
  "long-form-video-editor",
]);

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return base || "resume";
}

function isCreativeJob(slug: string): boolean {
  return CREATIVE_JOB_SLUGS.has(slug);
}

function isVideoEditorJob(slug: string): boolean {
  return VIDEO_EDITOR_JOB_SLUGS.has(slug);
}

export async function POST(req: Request) {
  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const visitorId = String(form.get("visitor_id") ?? "").trim();
  const jobSlug = String(form.get("job_slug") ?? "").trim().slice(0, JOB_SLUG_MAX);
  const firstName = String(form.get("first_name") ?? "").trim();
  const lastName = String(form.get("last_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const linkedinUrl = String(form.get("linkedin_url") ?? "").trim() || null;
  const twitterUrlRaw = String(form.get("twitter_url") ?? "").trim();
  const githubUrlRaw = String(form.get("github_url") ?? "").trim();
  const builtCreated = String(form.get("built_created") ?? "").trim() || null;
  const portfolio = String(form.get("portfolio") ?? "").trim() || null;
  const firstMonthBuild = String(form.get("first_month_build") ?? "").trim() || null;
  const salaryExpectationEur = String(form.get("salary_expectation_eur") ?? "").trim() || null;
  const aiWorkflow = String(form.get("ai_workflow") ?? "").trim() || null;
  const relocateOpen = String(form.get("relocate_open") ?? "").trim() || null;
  const anythingElse = String(form.get("anything_else") ?? "").trim() || null;
  const privacyAccepted = String(form.get("privacy_accepted") ?? "") === "true";

  const youtubeUrl = String(form.get("youtube_url") ?? "").trim() || null;
  const instagramUrl = String(form.get("instagram_url") ?? "").trim() || null;
  const tiktokUrl = String(form.get("tiktok_url") ?? "").trim() || null;
  const creativeFirstCreate =
    String(form.get("creative_first_create") ?? "").trim() || null;
  const creativeInspiration =
    String(form.get("creative_inspiration") ?? "").trim() || null;

  const resumeFile = form.get("resume");
  const isResumeFile = resumeFile instanceof File && resumeFile.size > 0;

  const creative = isCreativeJob(jobSlug);
  const videoEditor = isVideoEditorJob(jobSlug);

  if (!jobSlug) {
    return NextResponse.json({ error: "Missing job" }, { status: 400 });
  }

  let resolvedFirstName = firstName;
  let resolvedLastName = lastName;
  let videoEditorData: Record<string, unknown> | null = null;

  if (videoEditor) {
    const parsed = parseSmartShortFormVideoEditorApplicationForm(form);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    videoEditorData = parsed.data as unknown as Record<string, unknown>;
    resolvedFirstName = parsed.firstName;
    resolvedLastName = parsed.lastName;
  }

  if (!resolvedFirstName) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  if (!creative && !videoEditor) {
    if (!twitterUrlRaw) {
      return NextResponse.json({ error: "X (Twitter) URL required" }, { status: 400 });
    }
    if (!githubUrlRaw) {
      return NextResponse.json({ error: "GitHub URL required" }, { status: 400 });
    }
  }

  if (!videoEditor && (!relocateOpen || !["yes", "no"].includes(relocateOpen))) {
    return NextResponse.json({ error: "Please answer the relocation question" }, { status: 400 });
  }

  if (!privacyAccepted) {
    return NextResponse.json({ error: "Privacy consent required" }, { status: 400 });
  }

  if (isResumeFile && resumeFile.size > MAX_RESUME_BYTES) {
    return NextResponse.json({ error: "Resume file too large (max 5 MB)" }, { status: 400 });
  }

  const twitterUrl = twitterUrlRaw ? twitterUrlRaw.slice(0, 2000) : null;
  const githubUrl = githubUrlRaw ? githubUrlRaw.slice(0, 2000) : null;

  const applicationId = randomUUID();
  let resumePath: string | null = null;

  if (isResumeFile && resumeFile) {
    const buf = Buffer.from(await resumeFile.arrayBuffer());
    const safeName = sanitizeFilename(resumeFile.name);
    resumePath = `${applicationId}/${safeName}`;
    const { error: upErr } = await admin.storage
      .from("careers-resumes")
      .upload(resumePath, buf, {
        contentType: resumeFile.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  const row: Record<string, unknown> = {
    id: applicationId,
    visitor_id: visitorId.length >= 8 ? visitorId.slice(0, 80) : null,
    job_slug: jobSlug,
    first_name: resolvedFirstName.slice(0, 200),
    last_name: resolvedLastName.slice(0, 200),
    email: email.slice(0, 320),
    resume_storage_path: resumePath,
    linkedin_url: linkedinUrl ? linkedinUrl.slice(0, 2000) : null,
    twitter_url: twitterUrl,
    github_url: creative ? null : githubUrl,
    built_created: creative ? null : builtCreated,
    portfolio: videoEditor
      ? String(
          videoEditorData?.portfolio_social_url ??
            videoEditorData?.portfolio_youtube_url ??
            "",
        ).slice(0, 12000) || portfolio
      : portfolio,
    youtube_url: videoEditor
      ? String(
          videoEditorData?.portfolio_social_url ??
            videoEditorData?.portfolio_youtube_url ??
            "",
        ).slice(0, 2000)
      : creative && youtubeUrl
        ? youtubeUrl.slice(0, 2000)
        : null,
    first_month_build: creative ? null : firstMonthBuild,
    salary_expectation_eur: salaryExpectationEur ? salaryExpectationEur.slice(0, 200) : null,
    ai_workflow: creative ? null : aiWorkflow,
    relocate_open: videoEditor ? null : relocateOpen ? relocateOpen.slice(0, 20) : null,
    anything_else: videoEditor ? null : anythingElse,
    privacy_accepted: true,
    instagram_url: creative && instagramUrl ? instagramUrl.slice(0, 2000) : null,
    tiktok_url: creative && tiktokUrl ? tiktokUrl.slice(0, 2000) : null,
    creative_first_create: creative ? creativeFirstCreate : null,
    creative_inspiration: creative ? creativeInspiration : null,
    application_data: videoEditor ? videoEditorData : null,
  };

  const { error: insErr } = await admin.from("careers_applications").insert(row);

  if (insErr) {
    if (resumePath) {
      await admin.storage.from("careers-resumes").remove([resumePath]);
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  if (visitorId.length >= 8) {
    await admin.from("careers_funnel_events").insert({
      visitor_id: visitorId.slice(0, 80),
      event_type: "application_submitted",
      job_slug: jobSlug,
      meta: { application_id: applicationId },
    });
  }

  return NextResponse.json({ ok: true, id: applicationId });
}
