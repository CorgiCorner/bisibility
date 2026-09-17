"use client";

import { useTranslations } from "next-intl";
import { KpiCard } from "./KpiCard";
import type { OverviewKpi, OverviewView } from "./types";

export function OverviewKpiGrid({
  kpis,
  projectRef,
  visibilityCoverage,
}: Readonly<{
  kpis: OverviewKpi[];
  projectRef: string;
  visibilityCoverage: OverviewView["visibilityCoverage"];
}>) {
  const t = useTranslations("projectDashboard.dashboard");
  return (
    <section
      aria-label={t("kpisAriaLabel")}
      className="grid grid-cols-2 gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))]"
    >
      {kpis.map((kpi) => (
        <KpiCard
          {...kpi}
          key={kpi.id}
          projectRef={projectRef}
          visibilityCoverage={visibilityCoverage}
        />
      ))}
    </section>
  );
}
