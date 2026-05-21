import { cn } from "@/lib/utils";
import { VIDEO_EDITOR_PERFORMANCE_PAY } from "@/lib/careers/videoEditorPerformancePay";
import { careersTheme } from "./careersTheme";

type Props = {
  title?: string;
  className?: string;
  showVolumeNote?: boolean;
};

export function VideoEditorPerformancePayBlock({
  title = "Unlimited earning opportunity",
  className,
  showVolumeNote = true,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-violet-500/30 bg-violet-500/10 p-4",
        className,
      )}
    >
      <p className="font-semibold text-violet-100">{title}</p>
      <ul className="mt-2 list-none space-y-1 text-sm text-white/80">
        <li>
          <strong className="text-white">{VIDEO_EDITOR_PERFORMANCE_PAY.budget}</strong>
        </li>
        <li>{VIDEO_EDITOR_PERFORMANCE_PAY.minPayout}</li>
        <li>{VIDEO_EDITOR_PERFORMANCE_PAY.maxPayout}</li>
      </ul>
      {showVolumeNote ? (
        <p className="mt-2 text-sm text-white/75">
          {VIDEO_EDITOR_PERFORMANCE_PAY.rateLine}.{" "}
          <strong className="text-white">{VIDEO_EDITOR_PERFORMANCE_PAY.volumeLine}</strong>.
          Strong short form editors can scale earnings fast, the more you ship, the
          more you make.
        </p>
      ) : null}
    </div>
  );
}
