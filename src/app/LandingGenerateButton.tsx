"use client";

import Link from "next/link";
import { Poppins } from "next/font/google";
import { studioAppPath } from "@/lib/studioAppOrigin";
import styles from "./LandingGenerateButton.module.css";

const poppins = Poppins({
  weight: ["400"],
  subsets: ["latin"],
  display: "swap",
});

const GENERATE = ["G", "e", "n", "e", "r", "a", "t", "e"] as const;
const GENERATING = ["G", "e", "n", "e", "r", "a", "t", "i", "n", "g"] as const;

export function LandingGenerateButton() {
  return (
    <div className={styles.root}>
      <div className={styles.btnWrapper}>
        <Link href={studioAppPath("/signup")} prefetch={false} className={`${styles.btn} ${poppins.className}`}>
          <svg
            className={styles.btnSvg}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
            />
          </svg>
          <div className={styles.txtWrapper}>
            <div className={styles.txt1} aria-hidden>
              {GENERATE.map((ch, i) => (
                <span key={`g-${i}`} className={styles.btnLetter}>
                  {ch}
                </span>
              ))}
            </div>
            <div className={styles.txt2} aria-hidden>
              {GENERATING.map((ch, i) => (
                <span key={`ing-${i}`} className={styles.btnLetter}>
                  {ch}
                </span>
              ))}
            </div>
          </div>
          <span className="sr-only">Generate</span>
        </Link>
      </div>
    </div>
  );
}
