"use client";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import { useTranslations } from "next-intl";
export function TrackingMetrics({ data }: Readonly<{ data: TrackingWorkspaceData }>) {
  const t = useTranslations("projectAiTracking");
  const metrics = [
    {
      label: t("trackedPrompts"),
      value: String(data.prompts.filter((prompt) => prompt.status === "active").length),
      note: t("exactRevisionRetained"),
    },
    {
      label: t("completedRuns"),
      value: String(data.runs.filter((run) => run.state === "completed").length),
      note: t("partialRunsStaySeparate"),
    },
    { label: t("comparableCoverage"), value: t("notAvailable"), note: t("90MinimumInBothPeriods") },
    {
      label: t("enabledSchedules"),
      value: String(data.schedules.filter((schedule) => schedule.enabled).length),
      note: t("explicitCostConsentRequired"),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="min-w-0 rounded-card border border-border bg-bg-elev p-4"
        >
          <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            {metric.label}
          </p>
          <p className="mt-2 text-xl font-semibold">{metric.value}</p>
          <p className="mt-2 text-[11px] leading-4 text-fg-muted">{metric.note}</p>
        </div>
      ))}
    </div>
  );
}
