"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import SidebarAccountMenu from "@/app/_components/SidebarAccountMenu";
import CreditLowBanner from "@/app/_components/CreditLowBanner";

export type StudioNavSection = "link_to_ad" | "motion_control" | "image" | "video" | "projects";

type Props = {
  children: React.ReactNode;
  /** Sur /app : section active et changement via boutons (préserve l’état wizard). */
  studioSection?: StudioNavSection;
  onStudioSectionChange?: (s: StudioNavSection) => void;
  /** Pour préserver `?project=` dans les liens CREATE depuis crédits / abonnement. */
  studioProjectId?: string | null;
};

const CREATE_SECTIONS: { id: StudioNavSection; label: string }[] = [
  { id: "link_to_ad", label: "Link to Ad" },
  { id: "motion_control", label: "Motion Control" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
];

const PROJECTS_NAV: { id: StudioNavSection; label: string } = { id: "projects", label: "My Projects" };

function sectionHref(section: StudioNavSection, projectId: string | null | undefined): string {
  const p = new URLSearchParams();
  p.set("section", section);
  if (projectId) p.set("project", projectId);
  return `/app?${p.toString()}`;
}

function navButtonClass(active: boolean): string {
  return [
    "block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all cursor-pointer",
    active
      ? "bg-violet-400 text-black shadow-[0_7px_0_0_rgba(76,29,149,0.95)] hover:bg-violet-300 hover:shadow-[0_9px_0_0_rgba(76,29,149,0.95)] active:translate-y-[6px]"
      : "border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-violet-400/40 shadow-[0_0_22px_rgba(139,92,246,0.12)] hover:shadow-[0_0_36px_rgba(139,92,246,0.22)]",
  ].join(" ");
}

export default function StudioShell({
  children,
  studioSection,
  onStudioSectionChange,
  studioProjectId,
}: Props) {
  const pathname = usePathname();
  const [email, setEmail] = useState("");

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

  return (
    <div className="dark min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed left-1/2 top-0 -z-0 h-[520px] w-[1000px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[150px]" />
      <main className="relative z-10 grid min-h-screen grid-cols-[250px_1fr] items-start">
        <aside className="sticky top-0 flex h-screen flex-col overflow-hidden border-r border-white/10 bg-[#06070d] px-3 py-4">
          <div className="shrink-0 px-2 pb-2">
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
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="rounded-xl border border-white/10 bg-[#0b0912]/85 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">CREATE</p>
              <div className="mt-2 space-y-2.5">
                {CREATE_SECTIONS.map(({ id, label }) => {
                  const active = controlled && activeSection === id;
                  if (controlled) {
                    return (
                      <button
                        key={id}
                        type="button"
                        className={navButtonClass(active)}
                        onClick={() => onStudioSectionChange!(id)}
                      >
                        {label}
                      </button>
                    );
                  }
                  return (
                    <Link key={id} href={sectionHref(id, studioProjectId ?? null)} className={navButtonClass(active)}>
                      {label}
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
                    {PROJECTS_NAV.label}
                  </button>
                ) : (
                  <Link
                    href={sectionHref(PROJECTS_NAV.id, studioProjectId ?? null)}
                    className={navButtonClass(activeSection === PROJECTS_NAV.id)}
                  >
                    {PROJECTS_NAV.label}
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="mt-auto shrink-0 border-t border-white/10 pt-3">
            <SidebarAccountMenu email={email} onLogout={onSignOut} planLabel="Free" />
          </div>
        </aside>

        {children}
      </main>

      <CreditLowBanner />
    </div>
  );
}
