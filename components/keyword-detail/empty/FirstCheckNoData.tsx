import {
  EmptyModuleCard,
  EmptyModuleLabel,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { rankObservationState, TRACKED_DEPTH_NOT_FOUND_LABEL } from "@/lib/serp/rank-depth";
import type { ReactNode } from "react";

export type FirstCheckNoDataProps = {
  nextCheckLabel?: string;
  trackedDepth?: number;
  trackedSince?: string;
};

type FirstCheckCardProps = {
  children: ReactNode;
  label: string;
};

function FirstCheckCard({ children, label }: Readonly<FirstCheckCardProps>) {
  return (
    <section className="flex min-h-[118px] min-w-0 flex-col rounded-[12px] border border-border-strong bg-bg-elev p-4">
      <EmptyModuleLabel>{label}</EmptyModuleLabel>
      {children}
    </section>
  );
}

function firstCheckPositionLabel(trackedDepth: number) {
  const observation = rankObservationState({
    completedChecks: 1,
    position: null,
    trackedDepth,
  });

  return observation.kind === "not_ranked"
    ? TRACKED_DEPTH_NOT_FOUND_LABEL.replace(/\d+$/, String(trackedDepth))
    : observation.label;
}

export function FirstCheckNoData({
  nextCheckLabel = "Not scheduled",
  trackedDepth = 20,
  trackedSince = "Not available",
}: Readonly<FirstCheckNoDataProps>) {
  const safeTrackedDepth = Math.max(1, Math.round(trackedDepth));

  return (
    <EmptyModuleCard>
      <div className="grid gap-3 lg:grid-cols-3">
        <FirstCheckCard label="Position">
          <p className="m-0 mt-2 text-[15px] font-semibold text-fg-muted">
            {firstCheckPositionLabel(safeTrackedDepth)}
          </p>
          <p className="m-0 mt-auto pt-3 font-mono text-[10.5px] text-fg-muted">
            Tracked since {trackedSince}
          </p>
        </FirstCheckCard>
        <FirstCheckCard label="Ranking URL">
          <p className="m-0 mt-2 text-[15px] font-semibold text-fg-muted">
            No ranking URL observed yet
          </p>
        </FirstCheckCard>
        <FirstCheckCard label="What changed">
          <p className="m-0 mt-2 text-[15px] font-semibold text-fg">First check collected</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">
            One more check is needed to establish a trend.
          </p>
          <p className="m-0 mt-auto pt-3 font-mono text-[10.5px] text-fg-muted">
            Next check: {nextCheckLabel}
          </p>
        </FirstCheckCard>
      </div>
    </EmptyModuleCard>
  );
}
