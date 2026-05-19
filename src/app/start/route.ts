export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { startLinkRedirectResponse } from "@/lib/analytics/startLinkRedirect";

export async function GET(req: NextRequest) {
  return startLinkRedirectResponse(req);
}
