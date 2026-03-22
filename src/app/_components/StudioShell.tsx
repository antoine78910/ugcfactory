"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Maximize2,
  UserRound,
  Video,
  Joystick,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import SidebarAccountMenu from "@/app/_components/SidebarAccountMenu";
import CreditLowBanner from "@/app/_components/CreditLowBanner";
import { useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import SidebarCreditsBar from "@/app/_components/SidebarCreditsBar";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_LS = "youry-studio-sidebar-collapsed";

export type StudioNavSection =
  | "link_to_ad"
  | "avatar"
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
  { kind: "route", id: "avatar", label: "Avatar", icon: UserRound },
  { kind: "soon", label: "Ad Clone", icon: Copy },
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
    "block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-all cursor-pointer leading-tight",
    active
      ? "bg-violet-400 text-black shadow-[0_4px_0_0_rgba(76,29,149,0.95)] hover:bg-violet-300 hover:shadow-[0_5px_0_0_rgba(76,29,149,0.95)] active:translate-y-[2px] active:shadow-none"
      : "border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-violet-400/35 shadow-[0_0_12px_rgba(139,92,246,0.08)] hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]",
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
  const [navCollapsed, setNavCollapsed] = useState(false);

  useEffect(() => {
    try {
      setNavCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_LS) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_LS, navCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [navCollapsed]);

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
      <main
        className={cn(
          "relative z-10 grid min-h-screen items-start transition-[grid-template-columns] duration-200 ease-out",
          navCollapsed ? "grid-cols-[4rem_minmax(0,1fr)]" : "grid-cols-[230px_minmax(0,1fr)]",
        )}
      >
        <aside
          className={cn(
            "sticky top-0 flex h-screen flex-col overflow-hidden border-r border-white/10 bg-[#06070d] py-4",
            /* No text I-beam: feels natural to scroll the nav with the wheel over labels */
            "select-none [&_*]:cursor-default [&_a]:cursor-pointer [&_button]:cursor-pointer",
            navCollapsed ? "px-1.5" : "px-3",
          )}
        >
          <div
            className={cn(
              "shrink-0 pb-2",
              /* Same horizontal inset as CREATE card (aside px only) so Credits lines up */
              navCollapsed ? "space-y-2 px-0" : "space-y-3",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-1.5",
                navCollapsed ? "flex-col justify-center" : "flex-row",
              )}
            >
              <Link
                href="/app"
                className={cn("inline-block shrink-0", navCollapsed && "flex justify-center")}
                title="Youry home"
              >
                <Image
                  src="/youry-logo.png"
                  alt="Youry"
                  width={174}
                  height={52}
                  className={cn("w-auto", navCollapsed ? "h-6 max-w-[2.25rem] object-contain object-left" : "h-8")}
                  priority
                />
              </Link>
              <button
                type="button"
                onClick={() => setNavCollapsed((c) => !c)}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70 transition hover:border-violet-400/35 hover:bg-white/[0.1] hover:text-white",
                  navCollapsed && "mt-0.5",
                )}
                title={navCollapsed ? "Expand menu" : "Collapse menu"}
                aria-expanded={!navCollapsed}
                aria-label={navCollapsed ? "Expand menu" : "Collapse menu"}
              >
                {navCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>
            <SidebarCreditsBar collapsed={navCollapsed} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div
              className={cn(
                "rounded-xl border border-white/10 bg-[#0b0912]/85",
                navCollapsed ? "p-1.5" : "p-2",
              )}
            >
              <p
                className={cn(
                  "font-semibold uppercase tracking-[0.12em] text-white/45",
                  navCollapsed ? "sr-only" : "text-[10px] leading-none",
                )}
              >
                CREATE
              </p>
              <div className={cn("space-y-1", !navCollapsed && "mt-1")}>
                {CREATE_NAV.map((entry) => {
                  const NavIcon = entry.icon;
                  if (entry.kind === "soon") {
                    return (
                      <div
                        key="soon-ad-clone"
                        className={cn(
                          soonRowClass(),
                          navCollapsed && "!flex-row items-center justify-center gap-0 px-1.5 py-1.5",
                        )}
                        title={`${entry.label} — coming soon`}
                        aria-disabled="true"
                      >
                        <span
                          className={cn(
                            "flex w-full items-center gap-2",
                            navCollapsed ? "w-auto justify-center" : "",
                          )}
                        >
                          <NavIcon className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden />
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-xs font-semibold text-white/40",
                              navCollapsed && "sr-only",
                            )}
                          >
                            {entry.label}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "rounded border border-white/15 bg-white/[0.06] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white/50",
                            navCollapsed && "sr-only",
                          )}
                        >
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
                        className={cn(navButtonClass(active), navCollapsed && "px-1.5 py-2")}
                        title={label}
                        onClick={() => onStudioSectionChange!(id)}
                      >
                        <span
                          className={cn("flex items-center gap-2", navCollapsed && "justify-center")}
                        >
                          <NavIcon
                            className={`h-3.5 w-3.5 shrink-0 ${navRowIconClass(active)}`}
                            aria-hidden
                          />
                          <span className={cn(navCollapsed && "sr-only")}>{label}</span>
                        </span>
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={id}
                      href={sectionHref(id, studioProjectId ?? null)}
                      className={cn(navButtonClass(active), navCollapsed && "px-1.5 py-2")}
                      title={label}
                    >
                      <span className={cn("flex items-center gap-2", navCollapsed && "justify-center")}>
                        <NavIcon
                          className={`h-3.5 w-3.5 shrink-0 ${navRowIconClass(active)}`}
                          aria-hidden
                        />
                        <span className={cn(navCollapsed && "sr-only")}>{label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>

              <div
                className={cn(
                  "mt-1.5 border-t border-white/10 pt-1.5",
                  navCollapsed && "mt-1 pt-1",
                )}
              >
                {controlled ? (
                  <button
                    type="button"
                    className={cn(
                      navButtonClass(activeSection === PROJECTS_NAV.id),
                      navCollapsed && "px-1.5 py-2",
                    )}
                    title={PROJECTS_NAV.label}
                    onClick={() => onStudioSectionChange!(PROJECTS_NAV.id)}
                  >
                    <span className={cn("flex items-center gap-2", navCollapsed && "justify-center")}>
                      <ProjectsNavIcon
                        className={`h-3.5 w-3.5 shrink-0 ${navRowIconClass(activeSection === PROJECTS_NAV.id)}`}
                        aria-hidden
                      />
                      <span className={cn(navCollapsed && "sr-only")}>{PROJECTS_NAV.label}</span>
                    </span>
                  </button>
                ) : (
                  <Link
                    href={sectionHref(PROJECTS_NAV.id, studioProjectId ?? null)}
                    className={cn(
                      navButtonClass(activeSection === PROJECTS_NAV.id),
                      navCollapsed && "px-1.5 py-2",
                    )}
                    title={PROJECTS_NAV.label}
                  >
                    <span className={cn("flex items-center gap-2", navCollapsed && "justify-center")}>
                      <ProjectsNavIcon
                        className={`h-3.5 w-3.5 shrink-0 ${navRowIconClass(activeSection === PROJECTS_NAV.id)}`}
                        aria-hidden
                      />
                      <span className={cn(navCollapsed && "sr-only")}>{PROJECTS_NAV.label}</span>
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="mt-auto shrink-0 border-t border-white/10 pt-2">
            <SidebarAccountMenu
              email={email}
              onLogout={onSignOut}
              planLabel={planDisplayName}
              collapsed={navCollapsed}
            />
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
