"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  GitBranch,
  Image as ImageIcon,
  Link2,
  Lock,
  Maximize2,
  Menu,
  Mic,
  Sparkles,
  UserRound,
  Video,
  Joystick,
  Languages,
  X,
} from "lucide-react";
import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";
import SidebarAccountMenu from "@/app/_components/SidebarAccountMenu";
import CreditLowBanner from "@/app/_components/CreditLowBanner";
import StudioGenerationsBackgroundPoll from "@/app/_components/StudioGenerationsBackgroundPoll";
import { useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import SidebarCreditsBar from "@/app/_components/SidebarCreditsBar";
import { cn } from "@/lib/utils";
import {
  isCreditsOrSubscriptionPath,
  isStudioShellPath,
  pathnameWithoutLegacyAppPrefix,
} from "@/lib/studioPaths";

const SIDEBAR_COLLAPSED_LS = "youry-studio-sidebar-collapsed";
/** Last studio section for deep links back; CREATE highlight is cleared on /credits and /subscription. */
const LAST_STUDIO_NAV_SECTION_LS = "youry-last-studio-nav-section";

export type StudioNavSection =
  | "link_to_ad"
  | "avatar"
  | "ad_clone"
  | "voice"
  | "motion_control"
  | "image"
  | "video"
  | "upscale"
  | "projects";

const SECTION_TO_SLUG: Record<StudioNavSection, string> = {
  link_to_ad: "link-to-ad",
  avatar: "avatar",
  ad_clone: "translate",
  voice: "voice",
  motion_control: "motion-control",
  image: "image",
  video: "video",
  upscale: "upscale",
  projects: "my-projects",
};

const SLUG_TO_SECTION: Record<string, StudioNavSection> = Object.fromEntries(
  Object.entries(SECTION_TO_SLUG).map(([k, v]) => [v, k]),
) as Record<string, StudioNavSection>;

function readStoredStudioNavSection(): StudioNavSection {
  if (typeof window === "undefined") return "link_to_ad";
  try {
    const raw = localStorage.getItem(LAST_STUDIO_NAV_SECTION_LS);
    if (raw && raw in SECTION_TO_SLUG) return raw as StudioNavSection;
  } catch {
    /* ignore */
  }
  return "link_to_ad";
}

type Props = {
  children: React.ReactNode;
  studioSection?: StudioNavSection;
  onStudioSectionChange?: (s: StudioNavSection) => void;
  studioProjectId?: string | null;
};

type CreateNavEntry =
  | { kind: "route"; id: StudioNavSection; label: string; icon: LucideIcon }
  | {
      kind: "custom-link";
      id: string;
      href: string;
      label: string;
      icon: LucideIcon;
      /** Grayed, no navigation, “Soon” pill */
      soon?: boolean;
    };

const CREATE_NAV: CreateNavEntry[] = [
  { kind: "route", id: "link_to_ad", label: "Link to Ad", icon: Link2 },
  {
    kind: "custom-link",
    id: "workflow",
    href: "/workflow",
    label: "Workflow",
    icon: GitBranch,
    soon: true,
  },
  { kind: "route", id: "avatar", label: "Avatar", icon: UserRound },
  { kind: "route", id: "ad_clone", label: "Translate", icon: Languages },
  { kind: "route", id: "voice", label: "Voice", icon: Mic },
  { kind: "route", id: "motion_control", label: "Motion Control", icon: Joystick },
  { kind: "route", id: "image", label: "Image", icon: ImageIcon },
  { kind: "route", id: "video", label: "Video", icon: Video },
  { kind: "route", id: "upscale", label: "Upscale", icon: Maximize2 },
];

const PROJECTS_NAV: { id: StudioNavSection; label: string; icon: LucideIcon } = {
  id: "projects",
  label: "My Projects",
  icon: FolderOpen,
};

function sectionHref(section: StudioNavSection, projectId: string | null | undefined): string {
  const slug = SECTION_TO_SLUG[section] ?? "link-to-ad";
  let href = `/${slug}`;
  /** My Projects always opens the brands dashboard, not a deep-linked run. */
  if (section === "projects") return href;
  if (projectId) href += `?project=${encodeURIComponent(projectId)}`;
  return href;
}

function sectionFromPathname(pathname: string): StudioNavSection {
  const stripped = pathname.replace(/^\/app\/?/, "");
  const first = stripped.split("/").filter(Boolean)[0] ?? "";
  return SLUG_TO_SECTION[first] ?? "link_to_ad";
}

/** Overlay shown over non-link_to_ad sections when the user is on a $1 trial. */
function TrialSectionLock({ sectionLabel }: { sectionLabel: string }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#050507]/80 backdrop-blur-sm">
      <div className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-[#0b0912]/95 p-8 text-center shadow-[0_0_60px_rgba(139,92,246,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="mb-4 flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10">
            <Lock className="h-6 w-6 text-violet-300" />
          </span>
        </div>
        <h2 className="text-lg font-bold text-white">{sectionLabel}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          Your $1 trial gives you access to <span className="font-semibold text-white/75">Link to Ad</span> only.
          Upgrade to unlock all features.
        </p>
        <a
          href="/subscription"
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 text-sm font-bold text-white shadow-[0_5px_0_0_rgba(76,29,149,0.9)] transition hover:bg-violet-400 hover:shadow-[0_7px_0_0_rgba(76,29,149,0.9)] active:translate-y-0.5 active:shadow-none"
        >
          <Sparkles className="h-4 w-4" />
          Upgrade to unlock
        </a>
        <a
          href="/link-to-ad"
          className="mt-3 block text-xs text-white/30 underline-offset-4 transition hover:text-white/55 hover:underline"
        >
          Back to Link to Ad
        </a>
      </div>
    </div>
  );
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
  const { planDisplayName, isTrial } = useCreditsPlan();
  /** User preference for collapsed rail; applied only on md+ (see `navCollapsed` below). */
  const [navCollapsedPref, setNavCollapsedPref] = useState(false);
  /** Mobile off-canvas drawer; closed by default on every page load to maximize screen space on phones. */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  /** Track md (>=768px) so the collapsed layout only applies on desktop, never inside the mobile drawer. */
  const [isMdUp, setIsMdUp] = useState(true);
  /** Effective collapsed state used by all render logic: off on mobile so the drawer always shows full labels. */
  const navCollapsed = isMdUp && navCollapsedPref;
  /** Last studio CREATE section when leaving the studio (e.g. credits page); not used as active highlight on /credits or /subscription. */
  const [persistedStudioSection, setPersistedStudioSection] =
    useState<StudioNavSection>("link_to_ad");
  const supabase = useSupabaseBrowserClient();

  useEffect(() => {
    try {
      setNavCollapsedPref(localStorage.getItem(SIDEBAR_COLLAPSED_LS) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_LS, navCollapsedPref ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [navCollapsedPref]);

  /** Close the mobile drawer on any route change to avoid it staying open over new content. */
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsMdUp(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  /** Lock body scroll while the mobile drawer is open so taps on the backdrop feel correct. */
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileNavOpen]);

  /** App host uses bare `/link-to-ad` (middleware rewrites to `/app/...`); pathname often has no `/app` prefix. */
  const isStudioShell =
    pathname.startsWith("/app") || isStudioShellPath(pathname);

  // If parent provides section state, always trust it (prevents wrong highlights if pathname is stale).
  const controlled = Boolean(onStudioSectionChange && studioSection !== undefined);

  useEffect(() => {
    setPersistedStudioSection(readStoredStudioNavSection());
  }, []);

  useEffect(() => {
    if (!isStudioShell) return;
    const stripped = pathname.replace(/^\/app\/?/, "");
    const firstSeg = stripped.split("/").filter(Boolean)[0] ?? "";
    // Workflow uses its own nav row; don’t reset remembered CREATE tab to Link to Ad.
    if (firstSeg === "workflow") return;
    const s = sectionFromPathname(pathname);
    setPersistedStudioSection(s);
    try {
      localStorage.setItem(LAST_STUDIO_NAV_SECTION_LS, s);
    } catch {
      /* ignore */
    }
  }, [isStudioShell, pathname]);

  const activeSection: StudioNavSection | null = useMemo(() => {
    if (controlled && studioSection) return studioSection;
    if (isStudioShell) return sectionFromPathname(pathname);
    if (isCreditsOrSubscriptionPath(pathname)) return null;
    return persistedStudioSection;
  }, [controlled, studioSection, isStudioShell, pathname, persistedStudioSection]);

  const onWorkflowRoute = useMemo(() => {
    const p = pathname.replace(/^\/app(?=\/|$)/, "") || pathname;
    return p === "/workflow" || p.startsWith("/workflow/");
  }, [pathname]);

  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setEmail(user?.email ?? "");
    })();
  }, [supabase]);

  async function onSignOut() {
    try {
      if (supabase) await supabase.auth.signOut();
    } finally {
      window.location.href = "/auth";
    }
  }

  const ProjectsNavIcon = PROJECTS_NAV.icon;

  return (
    <div className="dark min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed left-1/2 top-0 -z-0 h-[520px] w-[1000px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[150px]" />

      {/* Mobile top bar: hamburger + logo; hidden on md+ where the sidebar is permanent. */}
      <div className="md:hidden sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-white/10 bg-[#06070d]/95 px-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setMobileNavOpen((open) => !open)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/80 transition hover:border-violet-400/35 hover:bg-white/[0.1] hover:text-white"
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileNavOpen}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Link href="/link-to-ad" className="inline-flex min-w-0 items-center" title="Youry home">
          <Image
            src="/youry-logo.png"
            alt="Youry"
            width={140}
            height={42}
            className="h-7 w-auto"
            priority
          />
        </Link>
        {/* Spacer to visually balance the hamburger on the left. */}
        <div className="h-10 w-10" aria-hidden />
      </div>

      <main
        className={cn(
          "relative z-10 min-h-screen",
        )}
      >
        <aside
          className={cn(
            // Desktop: permanently fixed sidebar (never moves while scrolling content).
            "md:fixed md:left-0 md:top-0 md:z-30 md:flex md:h-dvh md:max-w-none md:translate-x-0 md:shadow-none",
            // Mobile: off-canvas drawer, slides in from the left.
            "fixed inset-y-0 left-0 z-50 flex h-dvh w-[17rem] max-w-[85vw] flex-col overflow-visible border-r border-white/10 bg-[#06070d] py-4 shadow-2xl transition-transform duration-200 ease-out md:transition-none",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
            "select-none",
            navCollapsed ? "md:px-1.5 px-3" : "px-3",
            navCollapsed ? "md:w-16" : "md:w-[248px]",
          )}
        >
          <div
            className={cn(
              "shrink-0 pb-2",
              navCollapsed ? "space-y-2 px-0" : "space-y-3",
            )}
          >
            {navCollapsed ? (
              <div
                className="group relative mx-auto flex h-8 w-full min-w-0 shrink-0 items-center justify-center px-0.5"
                title="Hover icon to expand menu"
              >
                <Link
                  href="/link-to-ad"
                  className="relative z-0 flex h-8 w-8 shrink-0 items-center justify-center"
                  title="Youry home"
                >
                  <Image
                    src="/icon.png"
                    alt="Youry"
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-lg object-contain"
                    priority
                  />
                </Link>
                <button
                  type="button"
                  onClick={() => setNavCollapsedPref(false)}
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
                  href="/link-to-ad"
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
                  onClick={() => (isMdUp ? setNavCollapsedPref(true) : setMobileNavOpen(false))}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70 transition hover:border-violet-400/35 hover:bg-white/[0.1] hover:text-white",
                  )}
                  title={isMdUp ? "Collapse menu" : "Close menu"}
                  aria-expanded={isMdUp ? true : mobileNavOpen}
                  aria-label={isMdUp ? "Collapse menu" : "Close menu"}
                >
                  {isMdUp ? (
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <X className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              </div>
            )}
            <SidebarCreditsBar collapsed={navCollapsed} />
          </div>

          <div className="studio-sidebar-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y">
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
                  if (entry.kind === "custom-link") {
                    const { href, label, id: linkId, soon } = entry;
                    if (soon) {
                      return (
                        <div
                          key={linkId}
                          className={cn(
                            "pointer-events-none block w-full min-w-0 select-none rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-left text-[15px] font-semibold leading-snug text-white/32 shadow-none",
                            navCollapsed && "px-2.5 py-3.5",
                          )}
                          title={`${label}, coming soon`}
                          aria-disabled="true"
                        >
                          <span
                            className={cn(
                              "flex min-w-0 items-center gap-2",
                              navCollapsed && "justify-center",
                            )}
                          >
                            <NavIcon className="h-5 w-5 shrink-0 text-white/22" aria-hidden />
                            <span className={cn("min-w-0 flex-1 truncate", navCollapsed && "sr-only")}>
                              {label}
                            </span>
                            {!navCollapsed ? (
                              <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/38">
                                Soon
                              </span>
                            ) : null}
                          </span>
                        </div>
                      );
                    }
                    const pathNorm = pathnameWithoutLegacyAppPrefix(pathname);
                    const active = pathNorm === href || pathNorm.startsWith(`${href}/`);
                    const content = (
                      <span className={cn("flex min-w-0 items-center gap-2.5", navCollapsed && "justify-center")}>
                        <NavIcon
                          className={`h-5 w-5 shrink-0 ${navRowIconClass(active)}`}
                          aria-hidden
                        />
                        <span className={cn("min-w-0 truncate", navCollapsed && "sr-only")}>{label}</span>
                      </span>
                    );
                    return (
                      <Link
                        key={linkId}
                        href={href}
                        className={cn(navButtonClass(active), navCollapsed && "px-2.5 py-3.5")}
                        title={label}
                      >
                        {content}
                      </Link>
                    );
                  }
                  const { id, label } = entry;
                  const active = !onWorkflowRoute && activeSection === id;
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
                      navButtonClass(!onWorkflowRoute && activeSection === PROJECTS_NAV.id),
                      navCollapsed && "px-2.5 py-3.5",
                    )}
                    title={PROJECTS_NAV.label}
                    onClick={() => onStudioSectionChange!(PROJECTS_NAV.id)}
                  >
                    <span className={cn("flex min-w-0 items-center gap-2.5", navCollapsed && "justify-center")}>
                      <ProjectsNavIcon
                        className={`h-5 w-5 shrink-0 ${navRowIconClass(!onWorkflowRoute && activeSection === PROJECTS_NAV.id)}`}
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
                      navButtonClass(!onWorkflowRoute && activeSection === PROJECTS_NAV.id),
                      navCollapsed && "px-2.5 py-3.5",
                    )}
                    title={PROJECTS_NAV.label}
                  >
                    <span className={cn("flex min-w-0 items-center gap-2.5", navCollapsed && "justify-center")}>
                      <ProjectsNavIcon
                        className={`h-5 w-5 shrink-0 ${navRowIconClass(!onWorkflowRoute && activeSection === PROJECTS_NAV.id)}`}
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

        <div
          className={cn(
            "relative z-0 min-h-0 min-w-0 transition-[padding] duration-200 ease-out",
            navCollapsed ? "md:pl-16" : "md:pl-[248px]",
          )}
        >
          {children}
          {isTrial && isStudioShell && activeSection !== "link_to_ad" && activeSection !== null ? (
            <TrialSectionLock
              sectionLabel={
                CREATE_NAV.find((e) => e.kind === "route" && e.id === activeSection)?.label ??
                (activeSection === "projects" ? "My Projects" : activeSection)
              }
            />
          ) : null}
        </div>
      </main>

      <StudioGenerationsBackgroundPoll />
      <CreditLowBanner />
    </div>
  );
}

export default function StudioShell(props: Props) {
  return <StudioShellInner {...props} />;
}
