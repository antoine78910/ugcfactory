import { cookies } from "next/headers";
import { START_LINK_VISITOR_COOKIE } from "@/lib/analytics/startLinkRef";

export async function readStartLinkVisitorIdFromRequest(): Promise<string | null> {
  try {
    const store = await cookies();
    const raw = store.get(START_LINK_VISITOR_COOKIE)?.value?.trim();
    return raw || null;
  } catch {
    return null;
  }
}
