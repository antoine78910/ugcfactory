"use client";

import { cn } from "@/lib/utils";

type WorkflowAmbientLayerProps = {
  /** Change this to replay the entrance wave (mount, new space, onboarding done). */
  waveKey: number;
  /** Dot grid (landing). Canvas uses React Flow `Background` instead. */
  showDotGrid?: boolean;
  className?: string;
};

export function WorkflowAmbientLayer({ waveKey, showDotGrid, className }: WorkflowAmbientLayerProps) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {showDotGrid ? (
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "radial-gradient(circle at center, rgba(196, 181, 253, 0.2) 1.15px, transparent 1.15px)",
            backgroundSize: "20px 20px",
          }}
        />
      ) : null}
      {/* Brighter violet hub in the middle, softer toward the edges */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 88% 82% at 50% 46%, rgba(196, 181, 253, 0.14) 0%, rgba(139, 92, 246, 0.06) 38%, transparent 58%),
            radial-gradient(ellipse 125% 115% at 50% 50%, transparent 32%, rgba(4, 5, 12, 0.72) 100%)
          `,
        }}
      />
      <div key={waveKey} className="absolute inset-0">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "workflow-ambient-wave-ring absolute rounded-full border border-violet-200/30 shadow-[0_0_100px_rgba(139,92,246,0.18)]",
              i === 1 && "workflow-ambient-wave-ring--delay-1",
              i === 2 && "workflow-ambient-wave-ring--delay-2",
            )}
          />
        ))}
      </div>
    </div>
  );
}
