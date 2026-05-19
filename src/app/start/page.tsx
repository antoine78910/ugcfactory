import type { Metadata } from "next";
import StartLinkClient from "./StartLinkClient";

export const metadata: Metadata = {
  title: "Get started | Youry",
  robots: { index: false, follow: false },
};

export default function StartPage() {
  return <StartLinkClient />;
}
