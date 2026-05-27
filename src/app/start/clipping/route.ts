export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { clippingSignupRedirectResponse } from "@/lib/analytics/clippingSignupRedirect";

export async function GET(req: NextRequest) {
  return clippingSignupRedirectResponse(req);
}
