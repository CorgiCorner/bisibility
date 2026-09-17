import {
  EmptyModuleCard,
  EmptyModuleLabel,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { rankObservationState } from "@/lib/serp/rank-depth";
import { useTranslations } from "next-intl";
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
    <section className="flex min-h-[118px] min-w-0 flex-col rounded-card border border-border bg-bg-elev p-4">
      <EmptyModuleLabel>{label}</EmptyModuleLabel>
      {children}
    </section>
  );
}

function firstCheckPositionLabel(trackedDepth: number, fallback: string) {
  const observation = rankObservationState({
    completedChecks: 1,
    position: null,
    trackedDepth,
  });

  return observation.kind === "not_ranked" ? fallback : observation.label;
}

export function FirstCheckNoData({
  nextCheckLabel,
  trackedDepth = 20,
  trackedSince,
}: Readonly<FirstCheckNoDataProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail.empty");
  const safeTrackedDepth = Math.max(1, Math.round(trackedDepth));
  const trackedSinceLabel = trackedSince ?? t("notAvailable");
  const nextCheck = nextCheckLabel ?? t("notScheduled");

  return (
    <EmptyModuleCard>
      <div className="grid gap-3 lg:grid-cols-3">
        <FirstCheckCard label={t("position")}>
          <p className="m-0 mt-2 text-[15px] font-semibold text-fg-muted">
            {firstCheckPositionLabel(
              safeTrackedDepth,
              t("notFoundTop", { depth: safeTrackedDepth }),
            )}
          </p>
          <p className="m-0 mt-auto pt-3 font-sans tabular-nums text-[10.5px] text-fg-muted">
            {t("trackedSince", { date: trackedSinceLabel })}
          </p>
        </FirstCheckCard>
        <FirstCheckCard label={t("rankingUrl")}>
          <p className="m-0 mt-2 text-[15px] font-semibold text-fg-muted">{t("noRankingUrl")}</p>
        </FirstCheckCard>
        <FirstCheckCard label={t("whatChanged")}>
          <p className="m-0 mt-2 text-[15px] font-semibold text-fg">{t("firstCheckCollected")}</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">{t("oneMoreCheck")}</p>
          <p className="m-0 mt-auto pt-3 font-sans tabular-nums text-[10.5px] text-fg-muted">
            {t("nextCheck", { date: nextCheck })}
          </p>
        </FirstCheckCard>
      </div>
    </EmptyModuleCard>
  );
}
