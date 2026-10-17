import { isRestrictedCreatorAccount } from "@/lib/influencerAccounts";
import { pathnameWithoutLegacyAppPrefix } from "@/lib/studioPaths";
import { waitForSupabaseBrowserClient } from "@/lib/supabase/client";

/** Same formats page the Ecom Efficiency creator dashboard links to. */
export const EE_CREATOR_FORMATS_URL =
  "https://app.notion.com/p/Ecom-Efficiency-Formats-7caa8ab34f824f24afcfc1897e57c864";

export const CREATOR_FORMATS_NOTICE_EVENT = "creator-formats-notice";

/** API error code when a creator tries to generate instead of using a static template. */
export const CREATOR_TEMPLATES_ONLY = "CREATOR_TEMPLATES_ONLY";

export type CreatorFormatsNoticeDetail = {
  /** Leave a locked tool and open Workflow after the creator dismisses the notice. */
  redirectOnClose?: boolean;
};

let restrictedCreator: boolean | null = null;
let notedResolve: (() => void) | null = null;
let noted = new Promise<void>((resolve) => {
  notedResolve = resolve;
});

export function noteRestrictedCreator(value: boolean) {
  restrictedCreator = value;
  notedResolve?.();
  notedResolve = null;
}

export function restrictedCreatorKnown(): boolean {
  return restrictedCreator === true;
}

/** Link to Ad and Workflow stay open. Every other studio tool is locked for creators. */
export function isCreatorAllowedPath(pathname: string): boolean {
  const stripped = pathnameWithoutLegacyAppPrefix(pathname);
  const first = stripped.split("/").filter(Boolean)[0] ?? "";
  return first === "link-to-ad" || first === "workflow";
}

export function dispatchCreatorFormatsNotice(detail?: CreatorFormatsNoticeDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CreatorFormatsNoticeDetail>(CREATOR_FORMATS_NOTICE_EVENT, {
      detail: detail ?? {},
    }),
  );
}

/** False when this session is an Ecom Efficiency creator. Shows the formats notice. */
export async function creatorGenerationAllowed(): Promise<boolean> {
  if (restrictedCreator === null) {
    await Promise.race([noted, new Promise<void>((resolve) => window.setTimeout(resolve, 400))]);
  }
  if (restrictedCreator === null && typeof window !== "undefined") {
    const client = await waitForSupabaseBrowserClient(2500);
    const { data } = client ? await client.auth.getUser() : { data: { user: null } };
    if (data.user) noteRestrictedCreator(isRestrictedCreatorAccount(data.user));
  }
  if (restrictedCreator) {
    dispatchCreatorFormatsNotice();
    return false;
  }
  return true;
}
