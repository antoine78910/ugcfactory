import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import type { SmartVideoEditorApplicationData } from "@/lib/careers/videoEditorApplication";
import { SMART_VIDEO_EDITOR_JOB_SLUG } from "@/lib/careers/videoEditorApplication";
import {
  VideoEditorApplicationDetail,
  isVideoEditorApplication,
} from "./_components/VideoEditorApplicationDetail";

type FunnelEvent = {
  id: string;
  created_at: string;
  visitor_id: string;
  event_type: string;
  job_slug: string | null;
  meta: Record<string, unknown> | null;
};

type Application = {
  id: string;
  created_at: string;
  visitor_id: string | null;
  job_slug: string;
  first_name: string;
  last_name: string;
  email: string;
  resume_storage_path: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  github_url: string | null;
  built_created: string | null;
  portfolio: string | null;
  first_month_build: string | null;
  salary_expectation_eur: string | null;
  ai_workflow: string | null;
  relocate_open: string | null;
  anything_else: string | null;
  privacy_accepted: boolean;
  youtube_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  creative_first_create: string | null;
  creative_inspiration: string | null;
  application_data: SmartVideoEditorApplicationData | null;
};

function videoEditorSummary(
  data: SmartVideoEditorApplicationData | null,
): string {
  if (!data) return "—";
  return `${data.videos_per_day}/day · ${data.discord_telegram}`;
}

function distinctVisitors(rows: FunnelEvent[], pred: (r: FunnelEvent) => boolean) {
  const s = new Set<string>();
  for (const r of rows) {
    if (pred(r)) s.add(r.visitor_id);
  }
  return s.size;
}

export default async function AdminCareersPage() {
  const admin = createSupabaseServiceClient();
  if (!admin) {
    return (
      <div className="min-h-screen bg-[#050507] p-6 text-white">
        <p className="text-sm text-white/60">Supabase service role is not configured.</p>
      </div>
    );
  }

  const { data: eventsRaw, error: evErr } = await admin
    .from("careers_funnel_events")
    .select("id,created_at,visitor_id,event_type,job_slug,meta")
    .order("created_at", { ascending: false })
    .limit(5000);

  const { data: appsRaw, error: appErr } = await admin
    .from("careers_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  const events = (eventsRaw ?? []) as FunnelEvent[];
  const applications = (appsRaw ?? []) as Application[];

  const visitorsFromCareers = distinctVisitors(
    events,
    (e) => e.event_type === "careers_landing",
  );
  const visitorsJob = distinctVisitors(events, (e) => e.event_type === "job_view");
  const visitorsAppTab = distinctVisitors(
    events,
    (e) => e.event_type === "application_tab_view",
  );
  const visitorsStarted = distinctVisitors(
    events,
    (e) => e.event_type === "application_started",
  );
  const submittedCount = applications.length;
  const submittedEvents = events.filter((e) => e.event_type === "application_submitted").length;

  const jobViewBySlug: Record<string, number> = {};
  for (const e of events) {
    if (e.event_type !== "job_view" || !e.job_slug) continue;
    jobViewBySlug[e.job_slug] = (jobViewBySlug[e.job_slug] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen bg-[#050507] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            href="/admin"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            ←
          </Link>
          <div>
            <h1 className="text-lg font-bold">Careers funnel</h1>
            <p className="text-xs text-white/45">
              Visited careers, opened roles, started applications, and full submissions.
            </p>
          </div>
        </div>

        {evErr || appErr ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {evErr?.message ?? appErr?.message ?? "Failed to load data. Run the careers migration if tables are missing."}
          </p>
        ) : null}

        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">
              Careers landing (sessions)
            </p>
            <p className="mt-1 text-2xl font-bold text-violet-300">{visitorsFromCareers}</p>
            <p className="mt-1 text-xs text-white/35">
              Distinct visitors who fired `careers_landing` this window (max 5k events loaded).
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">
              Opened a job posting
            </p>
            <p className="mt-1 text-2xl font-bold text-violet-300">{visitorsJob}</p>
            <p className="mt-1 text-xs text-white/35">Distinct visitors — `job_view` events.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">
              Opened Application tab
            </p>
            <p className="mt-1 text-2xl font-bold text-violet-300">{visitorsAppTab}</p>
            <p className="mt-1 text-xs text-white/35">Once per browser session per role.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">
              Started application form
            </p>
            <p className="mt-1 text-2xl font-bold text-violet-300">{visitorsStarted}</p>
            <p className="mt-1 text-xs text-white/35">
              First interaction on an application form (any role).
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">
              Submitted applications
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">{submittedCount}</p>
            <p className="mt-1 text-xs text-white/35">
              Rows in `careers_applications` · funnel events tagged submitted: {submittedEvents}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">
              All funnel events (sample)
            </p>
            <p className="mt-1 text-2xl font-bold text-white/80">{events.length}</p>
            <p className="mt-1 text-xs text-white/35">
              Latest {events.length} rows loaded for inspection below.
            </p>
          </div>
        </div>

        {Object.keys(jobViewBySlug).length > 0 ? (
          <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-sm font-semibold text-white/80">Job views by slug (raw events)</h2>
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {Object.entries(jobViewBySlug)
                .sort((a, b) => b[1] - a[1])
                .map(([slug, n]) => (
                  <li
                    key={slug}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-white/70"
                  >
                    <span className="font-medium text-white/90">{slug}</span>: {n}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        <h2 className="mb-3 text-sm font-semibold text-white/80">
          Recent applications (newest first)
        </h2>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[1200px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.04] text-[10px] uppercase tracking-wide text-white/45">
                <th className="p-2 font-medium">Received</th>
                <th className="p-2 font-medium">Role</th>
                <th className="p-2 font-medium">Name</th>
                <th className="p-2 font-medium">Email</th>
                <th className="p-2 font-medium">Relocate</th>
                <th className="p-2 font-medium">Salary (EUR)</th>
                <th className="p-2 font-medium">Resume</th>
                <th className="p-2 font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-white/45">
                    No applications yet.
                  </td>
                </tr>
              ) : (
                applications.map((a) => (
                  <tr key={a.id} className="border-b border-white/[0.06] align-top hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap p-2 text-white/55">
                      {new Date(a.created_at).toLocaleString("en-GB")}
                    </td>
                    <td className="p-2 text-violet-200">{a.job_slug}</td>
                    <td className="p-2 text-white/85">
                      {a.first_name} {a.last_name}
                    </td>
                    <td className="p-2 text-white/80">{a.email}</td>
                    <td className="p-2 text-white/60">
                      {a.job_slug === SMART_VIDEO_EDITOR_JOB_SLUG
                        ? videoEditorSummary(a.application_data)
                        : (a.relocate_open ?? "—")}
                    </td>
                    <td className="p-2 text-white/60">{a.salary_expectation_eur ?? "—"}</td>
                    <td className="max-w-[160px] truncate p-2 text-white/50" title={a.resume_storage_path ?? ""}>
                      {a.resume_storage_path ?? "—"}
                    </td>
                    <td className="p-2 text-[10px] text-violet-300/90">
                      <div className="flex max-w-[220px] flex-col gap-0.5">
                        {a.github_url ? (
                          <a href={a.github_url} target="_blank" rel="noopener noreferrer" className="truncate underline">
                            GitHub
                          </a>
                        ) : null}
                        {a.twitter_url ? (
                          <a href={a.twitter_url} target="_blank" rel="noopener noreferrer" className="truncate underline">
                            X
                          </a>
                        ) : null}
                        {a.linkedin_url ? (
                          <a href={a.linkedin_url} target="_blank" rel="noopener noreferrer" className="truncate underline">
                            LinkedIn
                          </a>
                        ) : null}
                        {a.youtube_url ? (
                          <a href={a.youtube_url} target="_blank" rel="noopener noreferrer" className="truncate underline">
                            YouTube
                          </a>
                        ) : null}
                        {a.instagram_url ? (
                          <a href={a.instagram_url} target="_blank" rel="noopener noreferrer" className="truncate underline">
                            Instagram
                          </a>
                        ) : null}
                        {a.tiktok_url ? (
                          <a href={a.tiktok_url} target="_blank" rel="noopener noreferrer" className="truncate underline">
                            TikTok
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {applications.length > 0 ? (
          <div className="mt-8 space-y-6">
            <h2 className="text-sm font-semibold text-white/80">Full answers</h2>
            {applications.map((a) => (
              <article
                key={`detail-${a.id}`}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm"
              >
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
                  <span className="font-semibold text-white">
                    {a.first_name} {a.last_name}
                  </span>
                  <span className="text-xs text-white/45">{a.email}</span>
                  <span className="text-xs text-violet-300">{a.job_slug}</span>
                </header>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  {isVideoEditorApplication(a.job_slug, a.application_data) ? (
                    <VideoEditorApplicationDetail data={a.application_data} />
                  ) : a.job_slug === "founding-creative" ? (
                    <>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] uppercase tracking-wide text-white/40">
                          Portfolio / projects
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-white/75">
                          {a.portfolio ?? "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] uppercase tracking-wide text-white/40">
                          First thing excited to create
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-white/75">
                          {a.creative_first_create ?? "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] uppercase tracking-wide text-white/40">
                          Creative inspiration examples
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-white/75">
                          {a.creative_inspiration ?? "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] uppercase tracking-wide text-white/40">
                          Anything else
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-white/75">
                          {a.anything_else ?? "—"}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-white/40">
                          What you have built
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-white/75">
                          {a.built_created ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-white/40">
                          Portfolio / projects
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-white/75">
                          {a.portfolio ?? "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] uppercase tracking-wide text-white/40">
                          First month
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-white/75">
                          {a.first_month_build ?? "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] uppercase tracking-wide text-white/40">
                          AI workflow
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-white/75">
                          {a.ai_workflow ?? "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] uppercase tracking-wide text-white/40">
                          Anything else
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-white/75">
                          {a.anything_else ?? "—"}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
