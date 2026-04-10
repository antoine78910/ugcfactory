"use client";

import { cn } from "@/lib/utils";

type WorkflowAmbientLayerProps = {
  /** Change this to replay the entrance wave (mount, new space, onboarding done). */
  waveKey: number;
  /**
   * Screen-fixed dot grid: dim field + brighter core (labs / Figma-style).
   * Replaces uniform React Flow dots so the hub stays viewport-centered.
   */
  dots?: "labs" | false;
  className?: string;
};

export function WorkflowAmbientLayer({ waveKey, dots, className }: WorkflowAmbientLayerProps) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {dots === "labs" ? (
        <div key={`labs-dots-${waveKey}`} className="workflow-ambient-labs-dots absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at center, rgba(167, 139, 250, 0.1) 1.05px, transparent 1.05px)",
              backgroundSize: "20px 20px",
            }}
          />
          <div
            className="absolute inset-0 [mask-image:radial-gradient(ellipse_68%_64%_at_50%_46%,#000_0%,transparent_70%)] [-webkit-mask-image:radial-gradient(ellipse_68%_64%_at_50%_46%,#000_0%,transparent_70%)]"
            style={{
              backgroundImage:
                "radial-gradient(circle at center, rgba(237, 233, 254, 0.5) 1.2px, transparent 1.2px)",
              backgroundSize: "20px 20px",
            }}
          />
        </div>
      ) : null}

      {/* Brighter violet hub in the middle, softer toward the edges */}
      <div
        key={`vignette-${waveKey}`}
        className="workflow-ambient-vignette-pulse absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 82% 78% at 50% 46%, rgba(221, 214, 254, 0.2) 0%, rgba(167, 139, 250, 0.09) 36%, transparent 58%),
            radial-gradient(ellipse 125% 115% at 50% 50%, transparent 30%, rgba(4, 5, 12, 0.78) 100%)
          `,
        }}
      />

      <div key={waveKey} className="absolute inset-0">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "workflow-ambient-wave-ring absolute rounded-full",
              i === 1 && "workflow-ambient-wave-ring--delay-1",
              i === 2 && "workflow-ambient-wave-ring--delay-2",
              i === 3 && "workflow-ambient-wave-ring--delay-3",
            )}
          />
        ))}
      </div>
    </div>
  );
}
