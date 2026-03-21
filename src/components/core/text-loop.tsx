"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Children, isValidElement, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TextLoopProps = {
  children: ReactNode;
  className?: string;
  /** How long each phrase stays visible (ms). */
  intervalMs?: number;
  /** When this value changes, the loop resets to the first phrase. */
  activeKey?: string;
};

/**
 * Cycles through child text nodes with a short crossfade / slide for smoother loading UX.
 */
export function TextLoop({ children, className, intervalMs = 2800, activeKey }: TextLoopProps) {
  const items = Children.toArray(children).filter((c) => c != null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [activeKey]);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [items.length, intervalMs]);

  if (items.length === 0) return null;

  const current = items[index];

  if (items.length === 1) {
    return (
      <span className={cn("inline-block", className)}>
        {isValidElement(current) ? current : <span>{current}</span>}
      </span>
    );
  }

  return (
    <span className={cn("relative inline-block min-h-[1.35em] align-baseline", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`${activeKey ?? "loop"}-${index}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="block"
        >
          {isValidElement(current) ? current : <span>{current}</span>}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
