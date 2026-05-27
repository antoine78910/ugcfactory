import { cookies } from "next/headers";
import { CLIPPING_SIGNUP_VISITOR_COOKIE } from "@/lib/analytics/clippingSignupRef";

export async function readClippingSignupVisitorIdFromRequest(): Promise<string | null> {
  try {
    const store = await cookies();
    const raw = store.get(CLIPPING_SIGNUP_VISITOR_COOKIE)?.value?.trim();
    return raw || null;
  } catch {
    return null;
  }
}
