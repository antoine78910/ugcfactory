"use client";

import { cn } from "@/lib/utils";

type WorkflowAmbientLayerProps = {
  waveKey?: number;
  /** Only the workflow **editor** should use dots via React Flow; listing uses `false`. */
  dots?: "labs" | false;
  className?: string;
};

/**
 * Optional static dot grid. The live canvas uses `<Background>` in `WorkflowEditor` so dots pan with the graph.
 */
export function WorkflowAmbientLayer({ waveKey = 0, dots, className }: WorkflowAmbientLayerProps) {
  if (dots !== "labs") return null;

  return (
    <div
      key={`labs-dots-${waveKey}`}
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(167, 139, 250, 0.078) 1.05px, transparent 1.05px)",
          backgroundSize: "20px 20px",
        }}
      />
      <div
        className="absolute inset-0 [mask-image:radial-gradient(ellipse_58%_54%_at_50%_46%,#000_0%,transparent_76%)] [-webkit-mask-image:radial-gradient(ellipse_58%_54%_at_50%_46%,#000_0%,transparent_76%)]"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(232, 226, 255, 0.26) 1.2px, transparent 1.2px)",
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  );
}
