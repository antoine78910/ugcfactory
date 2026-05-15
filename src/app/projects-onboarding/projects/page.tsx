import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Row = {
  id: string;
  title: string;
  site_url: string;
  site_name: string | null;
  updated_at: string;
  created_at: string;
};

export default async function BrandProjectsListPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin?redirect=" + encodeURIComponent("/projects-onboarding/projects"));

  const { data, error } = await supabase
    .from("brand_projects")
    .select("id,title,site_url,site_name,updated_at,created_at")
    .order("updated_at", { ascending: false });

  const rows = (error ? [] : (data ?? [])) as Row[];

  return (
    <div className="min-h-[100dvh] bg-[#050507] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My projects</h1>
            <p className="mt-1 text-sm text-white/55">Brand research and competitor context from onboarding.</p>
          </div>
          <Button asChild className="bg-violet-400 text-black hover:bg-violet-300">
            <Link href="/projects-onboarding">New brand project</Link>
          </Button>
        </div>

        {rows.length === 0 ? (
          <Card className="border-white/10 bg-white/[0.03] shadow-none">
            <CardHeader>
              <CardTitle>No projects yet</CardTitle>
              <CardDescription className="text-white/55">
                Run the brand onboarding wizard to crawl your site, analyze angles, and enrich competitors with
                TrendTrack.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" className="border-white/15 bg-white/10 text-white hover:bg-white/15">
                <Link href="/projects-onboarding">Start brand onboarding</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`/projects-onboarding/projects/${encodeURIComponent(r.id)}`}
                className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-violet-400/35 hover:bg-white/[0.05]"
              >
                <div className="font-medium text-white">{r.title}</div>
                <div className="mt-1 text-sm text-white/50">{r.site_url}</div>
                <div className="mt-2 text-xs text-white/35">
                  Updated {new Date(r.updated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="text-center text-xs text-white/35">
          <Link href="/projects-onboarding" className="text-violet-300 hover:underline">
            Brand onboarding
          </Link>
          <span className="mx-2">·</span>
          <Link href="/onboarding" className="text-violet-300 hover:underline">
            Account onboarding
          </Link>
        </div>
      </div>
    </div>
  );
}
