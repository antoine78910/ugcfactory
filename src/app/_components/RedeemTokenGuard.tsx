"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * After sign-in, if the user had a pending redeem token stored in sessionStorage,
 * redirect them back to /redeem so the token is claimed automatically.
 * Mount this inside an authenticated layout (e.g. app/).
 */
export function RedeemTokenGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/redeem")) return;
    const pending = sessionStorage.getItem("redeem_token_pending");
    if (pending) {
      sessionStorage.removeItem("redeem_token_pending");
      router.replace(`/redeem?token=${encodeURIComponent(pending)}`);
    }
  }, [pathname, router]);

  return null;
}
