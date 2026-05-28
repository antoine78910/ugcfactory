import type { ReactNode } from "react";

import { clippingRootClassName } from "@/lib/clippingUi";

export default function ClippingLayout({ children }: { children: ReactNode }) {
  return <div className={clippingRootClassName}>{children}</div>;
}
