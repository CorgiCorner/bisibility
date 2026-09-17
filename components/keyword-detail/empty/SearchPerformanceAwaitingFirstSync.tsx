import {
  EmptyModuleCard,
  EmptyModuleTitle,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type LandingPagePerformanceModuleProps = {
  dataSourceCount: number;
  children: ReactNode;
};

/** A single source cannot form a landing-page performance comparison. */
export function LandingPagePerformanceModule({
  children,
  dataSourceCount,
}: Readonly<LandingPagePerformanceModuleProps>) {
  if (dataSourceCount === 1) return null;
  return <>{children}</>;
}

export function SearchPerformanceAwaitingFirstSync() {
  const t = useTranslations("projectRankTracker.keywordDetail.empty");
  return (
    <EmptyModuleCard>
      <div className="flex flex-wrap items-center gap-2">
        <EmptyModuleTitle>{t("searchPerformance")}</EmptyModuleTitle>
        <span className="inline-flex h-6 items-center rounded-full border border-border bg-bg-sunken px-2.5 font-sans tabular-nums text-[10.5px] text-fg-muted">
          {t("searchConsole")}
        </span>
      </div>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">{t("trailingDays", { days: 28 })}</p>
      <div className="mt-4 rounded-control border border-dashed border-border bg-bg-sunken px-4 py-5">
        <p className="m-0 text-[13px] font-medium text-fg">{t("awaitingSync")}</p>
        <p className="m-0 mt-2 text-[12px] leading-[1.5] text-fg-muted">
          {t("reportingLag", { days: 3 })}
        </p>
      </div>
    </EmptyModuleCard>
  );
}
