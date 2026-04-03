"use client";

import Link from "next/link";
import styles from "./LandingSeedanceTopButton.module.css";

export function LandingSeedanceTopButton() {
  return (
    <div className={styles.wrapper}>
      <Link href="/signup" className={styles.btn}>
        Seedance Pro 2.0 now available !
      </Link>
    </div>
  );
}
