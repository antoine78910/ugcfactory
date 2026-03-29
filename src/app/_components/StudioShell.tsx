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
import StudioGenerationsBackgroundPoll from "@/app/_components/StudioGenerationsBackgroundPoll";
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
    "flex w-full min-h-[3.55rem] flex-row items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left",
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
    "block w-full min-w-0 rounded-lg px-4 py-3 text-left text-[15px] font-semibold transition-all cursor-pointer leading-snug",
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
          navCollapsed ? "grid-cols-[4rem_minmax(0,1fr)]" : "grid-cols-[248px_minmax(0,1fr)]",
        )}
      >
        <aside
          className={cn(
            /* z-20 + overflow-visible so account dropdown (collapsed) can extend over the main column */
            "sticky top-0 z-20 flex h-screen flex-col overflow-visible border-r border-white/10 bg-[#06070d] py-4",
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
            {navCollapsed ? (
              <div
                className="group relative mx-auto h-8 w-8 shrink-0"
                title="Hover logo to expand menu"
              >
                <Link
                  href="/app"
                  className="relative z-0 block h-8 w-8"
                  title="Youry home"
                >
                  <Image
                    src="/icon.png"
                    alt="Youry"
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-lg object-cover"
                    priority
                  />
                </Link>
                <button
                  type="button"
                  onClick={() => setNavCollapsed(false)}
                  className={cn(
                    "absolute inset-0 z-10 flex items-center justify-center rounded-lg",
                    "border border-violet-400/45 bg-[#050507]/90 text-white shadow-sm backdrop-blur-sm",
                    "opacity-0 pointer-events-none transition-opacity duration-150",
                    "group-hover:pointer-events-auto group-hover:opacity-100",
                    "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60",
                  )}
                  title="Expand menu"
                  aria-expanded={false}
                  aria-label="Expand menu"
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ) : (
              <div className="flex w-full min-w-0 items-center justify-between gap-2">
                <Link
                  href="/app"
                  className="inline-block min-w-0 shrink"
                  title="Youry home"
                >
                  <Image
                    src="/youry-logo.png"
                    alt="Youry"
                    width={174}
                    height={52}
                    className="h-8 w-auto max-w-[min(100%,11rem)]"
                    priority
                  />
                </Link>
                <button
                  type="button"
                  onClick={() => setNavCollapsed(true)}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70 transition hover:border-violet-400/35 hover:bg-white/[0.1] hover:text-white",
                  )}
                  title="Collapse menu"
                  aria-expanded={true}
                  aria-label="Collapse menu"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}
            <SidebarCreditsBar collapsed={navCollapsed} />
          </div>

          <div className="studio-sidebar-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div
              className={cn(
                "rounded-xl border border-white/10 bg-[#0b0912]/85",
                navCollapsed ? "p-1.5" : "p-2.5",
              )}
            >
              <p
                className={cn(
                  "font-semibold uppercase tracking-[0.12em] text-white/45",
                  navCollapsed ? "sr-only" : "text-[11px] leading-none",
                )}
              >
                CREATE
              </p>
              <div className={cn("space-y-2", !navCollapsed && "mt-2")}>
                {CREATE_NAV.map((entry) => {
                  const NavIcon = entry.icon;
                  if (entry.kind === "soon") {
                    return (
                      <div
                        key="soon-ad-clone"
                        className={cn(
                          soonRowClass(),
                          navCollapsed && "!justify-center gap-0 px-1.5 py-2.5",
                        )}
                        title={`${entry.label} — coming soon`}
                        aria-disabled="true"
                      >
                        <span
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2.5",
                            navCollapsed && "w-auto flex-none justify-center",
                          )}
                        >
                          <NavIcon className="h-5 w-5 shrink-0 text-white/30" aria-hidden />
                          <span
                            className={cn(
                              "min-w-0 truncate text-[15px] font-semibold text-white/40",
                              navCollapsed && "sr-only",
                            )}
                          >
                            {entry.label}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50",
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
                        className={cn(navButtonClass(active), navCollapsed && "px-2.5 py-3.5")}
                        title={label}
                        onClick={() => onStudioSectionChange!(id)}
                      >
                        <span
                          className={cn("flex min-w-0 items-center gap-2.5", navCollapsed && "justify-center")}
                        >
                          <NavIcon
                            className={`h-5 w-5 shrink-0 ${navRowIconClass(active)}`}
                            aria-hidden
                          />
                          <span className={cn("min-w-0 truncate", navCollapsed && "sr-only")}>{label}</span>
                        </span>
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={id}
                      href={sectionHref(id, studioProjectId ?? null)}
                      className={cn(navButtonClass(active), navCollapsed && "px-2.5 py-3.5")}
                      title={label}
                    >
                      <span className={cn("flex min-w-0 items-center gap-2.5", navCollapsed && "justify-center")}>
                        <NavIcon
                          className={`h-5 w-5 shrink-0 ${navRowIconClass(active)}`}
                          aria-hidden
                        />
                        <span className={cn("min-w-0 truncate", navCollapsed && "sr-only")}>{label}</span>
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
                      navCollapsed && "px-2.5 py-3.5",
                    )}
                    title={PROJECTS_NAV.label}
                    onClick={() => onStudioSectionChange!(PROJECTS_NAV.id)}
                  >
                    <span className={cn("flex min-w-0 items-center gap-2.5", navCollapsed && "justify-center")}>
                      <ProjectsNavIcon
                        className={`h-5 w-5 shrink-0 ${navRowIconClass(activeSection === PROJECTS_NAV.id)}`}
                        aria-hidden
                      />
                      <span className={cn("min-w-0 truncate", navCollapsed && "sr-only")}>
                        {PROJECTS_NAV.label}
                      </span>
                    </span>
                  </button>
                ) : (
                  <Link
                    href={sectionHref(PROJECTS_NAV.id, studioProjectId ?? null)}
                    className={cn(
                      navButtonClass(activeSection === PROJECTS_NAV.id),
                      navCollapsed && "px-2.5 py-3.5",
                    )}
                    title={PROJECTS_NAV.label}
                  >
                    <span className={cn("flex min-w-0 items-center gap-2.5", navCollapsed && "justify-center")}>
                      <ProjectsNavIcon
                        className={`h-5 w-5 shrink-0 ${navRowIconClass(activeSection === PROJECTS_NAV.id)}`}
                        aria-hidden
                      />
                      <span className={cn("min-w-0 truncate", navCollapsed && "sr-only")}>
                        {PROJECTS_NAV.label}
                      </span>
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

        <div className="relative z-0 min-h-0 min-w-0">{children}</div>
      </main>

      <StudioGenerationsBackgroundPoll />
      <CreditLowBanner />
    </div>
  );
}

export default function StudioShell(props: Props) {
  /** CreditsPlanProvider is in the root layout so /app hooks and shell share one state. */
  return <StudioShellInner {...props} />;
}
