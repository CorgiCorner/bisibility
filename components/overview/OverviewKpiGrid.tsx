"use client";

import { useTranslations } from "next-intl";
import { KpiCard } from "./KpiCard";
import type { OverviewKpi, OverviewView } from "./types";

export function OverviewKpiGrid({
  kpis,
  projectRef,
  visibilityCoverage,
  qualityReport,
}: Readonly<{
  kpis: OverviewKpi[];
  projectRef: string;
  visibilityCoverage: OverviewView["visibilityCoverage"];
  qualityReport: OverviewView["qualityReport"];
}>) {
  const t = useTranslations("projectDashboard.dashboard");
  return (
    <section aria-label={t("kpisAriaLabel")} className="@container">
      <div className="grid grid-cols-1 gap-4 @[360px]:grid-cols-2 @[720px]:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard
            {...kpi}
            key={kpi.id}
            projectRef={projectRef}
            visibilityCoverage={visibilityCoverage}
            qualityReport={qualityReport}
          />
        ))}
      </div>
    </section>
  );
}
