"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Copy, FolderOpen, Image as ImageIcon, Link2, Maximize2, Video, Joystick } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import SidebarAccountMenu from "@/app/_components/SidebarAccountMenu";
import CreditLowBanner from "@/app/_components/CreditLowBanner";
import { useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import SidebarCreditsBar from "@/app/_components/SidebarCreditsBar";

export type StudioNavSection =
  | "link_to_ad"
  | "motion_control"
  | "image"
  | "video"
  | "upscale"
  | "projects";

type Props = {
  children: React.ReactNode;
  /** On /app: active section and changes via buttons (keeps wizard state). */
  studioSection?: StudioNavSection;
  onStudioSectionChange?: (s: StudioNavSection) => void;
  /** Preserve `?project=` in CREATE links from credits / subscription pages. */
  studioProjectId?: string | null;
};

type CreateNavEntry =
  | { kind: "route"; id: StudioNavSection; label: string; icon: LucideIcon }
  | { kind: "soon"; label: string; icon: LucideIcon };

const CREATE_NAV: CreateNavEntry[] = [
  { kind: "route", id: "link_to_ad", label: "Link to Ad", icon: Link2 },
  { kind: "soon", label: "Competitors Clone Ad", icon: Copy },
  { kind: "route", id: "motion_control", label: "Motion Control", icon: Joystick },
  { kind: "route", id: "image", label: "Image", icon: ImageIcon },
  { kind: "route", id: "video", label: "Video", icon: Video },
  { kind: "route", id: "upscale", label: "Upscale", icon: Maximize2 },
];

function soonRowClass(): string {
  return [
    "flex w-full flex-col items-start gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left",
    "cursor-not-allowed select-none pointer-events-none",
  ].join(" ");
}

const PROJECTS_NAV: { id: StudioNavSection; label: string; icon: LucideIcon } = {
  id: "projects",
  label: "My Projects",
  icon: FolderOpen,
};

function sectionHref(section: StudioNavSection, projectId: string | null | undefined): string {
  const p = new URLSearchParams();
  p.set("section", section);
  if (projectId) p.set("project", projectId);
  return `/app?${p.toString()}`;
}

function navRowIconClass(active: boolean): string {
  return active ? "text-black/80" : "text-violet-300/90";
}

function navButtonClass(active: boolean): string {
  return [
    "block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all cursor-pointer",
    active
      ? "bg-violet-400 text-black shadow-[0_7px_0_0_rgba(76,29,149,0.95)] hover:bg-violet-300 hover:shadow-[0_9px_0_0_rgba(76,29,149,0.95)] active:translate-y-[6px]"
      : "border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-violet-400/40 shadow-[0_0_22px_rgba(139,92,246,0.12)] hover:shadow-[0_0_36px_rgba(139,92,246,0.22)]",
  ].join(" ");
}

function StudioShellInner({
  children,
  studioSection,
  onStudioSectionChange,
  studioProjectId,
}: Props) {
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const { planDisplayName } = useCreditsPlan();

  const isApp = pathname === "/app";

  const controlled = Boolean(isApp && onStudioSectionChange && studioSection !== undefined);

  const activeSection: StudioNavSection = useMemo(() => {
    if (controlled && studioSection) return studioSection;
    return "link_to_ad";
  }, [controlled, studioSection]);

  useEffect(() => {
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setEmail(user?.email ?? "");
    })();
  }, []);

  async function onSignOut() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/auth";
    }
  }

  const ProjectsNavIcon = PROJECTS_NAV.icon;

  return (
    <div className="dark min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed left-1/2 top-0 -z-0 h-[520px] w-[1000px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[150px]" />
      <main className="relative z-10 grid min-h-screen grid-cols-[250px_1fr] items-start">
        <aside className="sticky top-0 flex h-screen flex-col overflow-hidden border-r border-white/10 bg-[#06070d] px-3 py-4">
          <div className="shrink-0 space-y-3 px-2 pb-2">
            <Link href="/app" className="inline-block">
              <Image
                src="/youry-logo.png"
                alt="Youry"
                width={174}
                height={52}
                className="h-8 w-auto"
                priority
              />
            </Link>
            <SidebarCreditsBar />
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="rounded-xl border border-white/10 bg-[#0b0912]/85 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">CREATE</p>
              <div className="mt-2 space-y-2.5">
                {CREATE_NAV.map((entry) => {
                  const NavIcon = entry.icon;
                  if (entry.kind === "soon") {
                    return (
                      <div
                        key={entry.label}
                        className={soonRowClass()}
                        title="Coming soon"
                        aria-disabled="true"
                      >
                        <span className="flex w-full items-center gap-2.5">
                          <NavIcon className="h-4 w-4 shrink-0 text-white/30" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/40">
                            {entry.label}
                          </span>
                        </span>
                        <span className="rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
                          Soon
                        </span>
                      </div>
                    );
                  }
                  const { id, label } = entry;
                  const active = controlled && activeSection === id;
                  if (controlled) {
                    return (
                      <button
                        key={id}
                        type="button"
                        className={navButtonClass(active)}
                        onClick={() => onStudioSectionChange!(id)}
                      >
                        <span className="flex items-center gap-2.5">
                          <NavIcon className={`h-4 w-4 shrink-0 ${navRowIconClass(active)}`} aria-hidden />
                          {label}
                        </span>
                      </button>
                    );
                  }
                  return (
                    <Link key={id} href={sectionHref(id, studioProjectId ?? null)} className={navButtonClass(active)}>
                      <span className="flex items-center gap-2.5">
                        <NavIcon className={`h-4 w-4 shrink-0 ${navRowIconClass(active)}`} aria-hidden />
                        {label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0b0912]/85 p-3">
              <div className="space-y-2.5">
                {controlled ? (
                  <button
                    type="button"
                    className={navButtonClass(activeSection === PROJECTS_NAV.id)}
                    onClick={() => onStudioSectionChange!(PROJECTS_NAV.id)}
                  >
                    <span className="flex items-center gap-2.5">
                      <ProjectsNavIcon
                        className={`h-4 w-4 shrink-0 ${navRowIconClass(activeSection === PROJECTS_NAV.id)}`}
                        aria-hidden
                      />
                      {PROJECTS_NAV.label}
                    </span>
                  </button>
                ) : (
                  <Link
                    href={sectionHref(PROJECTS_NAV.id, studioProjectId ?? null)}
                    className={navButtonClass(activeSection === PROJECTS_NAV.id)}
                  >
                    <span className="flex items-center gap-2.5">
                      <ProjectsNavIcon
                        className={`h-4 w-4 shrink-0 ${navRowIconClass(activeSection === PROJECTS_NAV.id)}`}
                        aria-hidden
                      />
                      {PROJECTS_NAV.label}
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="mt-auto shrink-0 border-t border-white/10 pt-3">
            <SidebarAccountMenu email={email} onLogout={onSignOut} planLabel={planDisplayName} />
          </div>
        </aside>

        {children}
      </main>

      <CreditLowBanner />
    </div>
  );
}

export default function StudioShell(props: Props) {
  /** CreditsPlanProvider is in the root layout so /app hooks and shell share one state. */
  return <StudioShellInner {...props} />;
}
