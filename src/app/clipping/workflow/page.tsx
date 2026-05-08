"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  listWorkflowTemplates,
  workflowCommunityTemplateId,
  type WorkflowTemplateMeta,
} from "@/app/workflow/workflowTemplates";

function mapCommunityTemplates(rows: unknown): WorkflowTemplateMeta[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => {
      if (!r || typeof r !== "object") return false;
      const id = (r as { id?: unknown }).id;
      return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id.trim());
    })
    .map((r) => {
      const row = r as {
        id: string;
        name?: unknown;
        blurb?: unknown;
        created_by_name?: unknown;
      };
      return {
        id: workflowCommunityTemplateId(row.id.trim()),
        name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Template",
        blurb: typeof row.blurb === "string" && row.blurb.trim() ? row.blurb.trim() : "",
        authorName:
          typeof row.created_by_name === "string" && row.created_by_name.trim()
            ? row.created_by_name.trim()
            : undefined,
        source: "community" as const,
      };
    });
}

export default function ClippingWorkflowTemplatesPage() {
  const [communityTemplates, setCommunityTemplates] = useState<WorkflowTemplateMeta[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/workflow/community-templates?t=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          // Clipping remains fully usable with built-in/local templates.
          // Do not surface transient/auth/server noise as a blocking UI error.
          return;
        }
        const json = (await res.json().catch(() => null)) as { templates?: unknown } | null;
        if (!mounted) return;
        setCommunityTemplates(mapCommunityTemplates(json?.templates));
      } catch {
        // Ignore network issues here; fallback templates are still listed.
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const templates = useMemo(
    () => listWorkflowTemplates("guest", communityTemplates),
    [communityTemplates],
  );

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#06050a] via-[#0a0612] to-[#050307] px-4 py-8 text-white sm:py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/80">
            Clipping workflow
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            All workflow templates for clipping
          </h1>
          <p className="text-sm text-white/65">
            Read-only access for clippers. Open any template to review steps and download
            images/videos where available.
          </p>
        </header>

        {templates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center text-sm text-white/55">
            No workflow templates available yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <article
                key={template.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200/80">
                  {template.source === "community"
                    ? "Community"
                    : template.source === "custom"
                      ? "Local copy"
                      : "Built-in"}
                </p>
                <h2 className="mt-2 text-base font-semibold text-white">{template.name}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  {template.blurb || "Workflow template for clipping preparation."}
                </p>
                {template.authorName ? (
                  <p className="mt-2 text-xs text-white/45">by {template.authorName}</p>
                ) : null}
                <Link
                  href={`/clipping/workflow/template/${encodeURIComponent(template.id)}`}
                  className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/[0.08]"
                >
                  Open read-only template
                </Link>
              </article>
            ))}
          </div>
        )}

        <div>
          <Link
            href="/clipping"
            className="inline-flex items-center rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/[0.08]"
          >
            Back to clipping tools
          </Link>
        </div>
      </div>
    </div>
  );
}
