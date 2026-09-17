"use client";

import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { KpiDeltaTone, OverviewKpi, OverviewView } from "./types";

export type KpiCardProps = OverviewKpi & {
  projectRef?: string;
  visibilityCoverage?: OverviewView["visibilityCoverage"];
};

const deltaToneClassName = {
  positive: "text-green-text",
  negative: "text-red-text",
  neutral: "text-fg-muted",
} satisfies Record<KpiDeltaTone, string>;

function labelCopy(
  t: ReturnType<typeof useTranslations<"projectDashboard.kpis">>,
  id: OverviewKpi["id"],
) {
  if (id === "averagePosition") return t("averagePosition");
  if (id === "trackedKeywords") return t("trackedKeywords");
  if (id === "inTop10") return t("inTop10");
  return t("visibility");
}

function deltaCopy(
  t: ReturnType<typeof useTranslations<"projectDashboard.kpis">>,
  delta: OverviewKpi["delta"],
) {
  if (delta.kind === "averageComparison") {
    return t("averageComparison", {
      direction: delta.value > 0 ? "up" : delta.value < 0 ? "down" : "unchanged",
      value: Math.abs(delta.value),
    });
  }
  if (delta.kind === "countThisMonth") return t("countThisMonth", { value: delta.value });
  if (delta.kind === "countChange") {
    return t("countChange", {
      direction: delta.value > 0 ? "positive" : delta.value < 0 ? "negative" : "unchanged",
      value: Math.abs(delta.value),
    });
  }
  if (delta.kind === "percentagePointChange") {
    return t("percentagePointChange", {
      direction: delta.value > 0 ? "positive" : delta.value < 0 ? "negative" : "unchanged",
      value: Math.abs(delta.value),
    });
  }
  if (delta.kind === "awaitingFirstCheck") return t("awaitingFirstCheck");
  if (delta.kind === "firstCheckFailed") return t("firstCheckFailed");
  if (delta.kind === "new") return t("new");
  if (delta.kind === "noNewThisMonth") return t("noNewThisMonth");
  if (delta.kind === "noRankedPositions") return t("noRankedPositions");
  return t("awaitingTop20");
}

export function KpiCard({
  value,
  delta,
  deltaAction,
  deltaTone,
  id,
  projectRef,
  visibilityCoverage,
}: Readonly<KpiCardProps>) {
  const format = useFormatter();
  const t = useTranslations("projectDashboard.kpis");
  const label = labelCopy(t, id);
  const renderedDelta = deltaCopy(t, delta);
  const valueClassName = value === null ? "text-fg-muted" : "text-fg";
  const renderedValue =
    value === null
      ? "–"
      : id === "visibility"
        ? t("visibilityPercentage", { value })
        : id === "averagePosition"
          ? format.number(value, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
          : format.number(value);
  const detail =
    id === "visibility" && visibilityCoverage
      ? t("visibilityDetail", {
          limited: visibilityCoverage.limited ? "true" : "false",
          measured: visibilityCoverage.measured,
          total: visibilityCoverage.total,
        })
      : undefined;

  return (
    <Card className="min-w-0 rounded-card px-4.5 py-4" size="md">
      <div className="flex min-h-6 items-center gap-1 font-sans tabular-nums text-[10.5px] uppercase tracking-[0.8px] text-fg-muted">
        <span className="truncate">{label}</span>
        {id === "visibility" ? <InfoTooltip text={t("visibilityDescription")} /> : null}
      </div>
      <div className="mt-[9px] flex items-end gap-3">
        <span className="min-w-0">
          <span
            className={`bv-countup text-[28px] font-bold leading-none tracking-[-0.8px] ${valueClassName}`}
          >
            {renderedValue}
          </span>
          {deltaAction === "check_runs" && projectRef ? (
            <Link
              className={`ml-2 align-baseline font-sans tabular-nums text-xs font-semibold hover:underline ${deltaToneClassName[deltaTone]}`}
              href={projectRunsPath(projectRef)}
            >
              {renderedDelta}
            </Link>
          ) : (
            <span
              className={`ml-2 align-baseline font-sans tabular-nums text-xs font-semibold ${deltaToneClassName[deltaTone]}`}
            >
              {renderedDelta}
            </span>
          )}
        </span>
      </div>
      {detail ? (
        <div className="mt-2 font-sans tabular-nums text-[11px] leading-normal text-fg-muted">
          {detail}
        </div>
      ) : null}
    </Card>
  );
}
