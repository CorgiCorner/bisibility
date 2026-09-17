"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import {
  TrackingConfigurationFields,
  type TrackingConfigurationValue,
} from "@/components/keywords/add/TrackingConfigurationFields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { formatDisplayMonthYear } from "@/lib/dates/format";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { appPath } from "@/lib/routing/app-path";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { ResearchDetailSaveAction } from "./ResearchDetailSaveAction";
import { ResearchIntentChip } from "./ResearchIntentChip";
import { ResearchTrackingCostLine } from "./ResearchTrackingCostLine";
import { ResearchUnavailableMetric } from "./ResearchUnavailableMetric";
import { chronologicalTrend, difficultyPillStyle } from "./research-results-model";
import { researchTrackingCost, researchTrackingCostLine } from "./research-tracking-cost";
import type { ResearchAddDraft } from "./research-workspace-model";

type ResearchDetailPanelProps = {
  active: GroupedResearchRow | null;
  defaultTracking?: TrackingConfigurationValue;
  metricsAvailable?: boolean;
  onAdd?: (draft: ResearchAddDraft) => void;
  onSave?: (row: GroupedResearchRow) => void;
  projectId?: string;
  readOnly?: boolean;
  seed: string;
  costContext?: ProjectCostContext;
  trackingMarketCount?: number;
};

function metric(value: number | null, formatter = (item: number) => String(item)) {
  return value == null ? "-" : formatter(value);
}

function Eyebrow({ children }: Readonly<{ children: string }>) {
  return (
    <p className="m-0 font-sans tabular-nums text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
      {children}
    </p>
  );
}

export function ResearchDetailPanel({
  active,
  costContext,
  defaultTracking,
  metricsAvailable = true,
  onAdd,
  onSave,
  projectId,
  readOnly = false,
  seed,
  trackingMarketCount = 1,
}: Readonly<ResearchDetailPanelProps>) {
  const t = useTranslations("projectResearch.detail");
  const format = useFormatter();
  const dateDisplay = useDateDisplay();
  const [device, setDevice] = useState(defaultTracking?.device ?? "desktop");
  const [location, setLocation] = useState(defaultTracking?.location);
  const [scheduleFrequency, setScheduleFrequency] = useState(
    defaultTracking?.scheduleFrequency ?? "project_default",
  );
  const keyword = active?.keyword ?? seed;
  const cost = costContext
    ? researchTrackingCost(costContext, scheduleFrequency, trackingMarketCount)
    : null;
  const line = costContext
    ? researchTrackingCostLine(costContext, scheduleFrequency, cost, trackingMarketCount)
    : null;
  const management =
    !readOnly && costContext && defaultTracking && line && location && onAdd && projectId
      ? { costContext, line, location, onAdd, projectId }
      : null;
  const points = chronologicalTrend(active?.monthlyTrend ?? []);
  const labels = points.map((point) =>
    formatDisplayMonthYear(`${point.year}-${String(point.month).padStart(2, "0")}-01`, dateDisplay),
  );
  const trend = points.map((point) => point.searchVolume);
  const availableTrend = trend.filter((value): value is number => value != null);
  const peak = Math.max(...availableTrend, 0);
  // Headroom above the peak so the line and area are never clipped at the plot edge.
  const trendMax = peak > 0 ? peak * 1.1 : undefined;

  return (
    <Card className="min-w-0 lg:sticky lg:top-4 lg:self-start" size="lg">
      <Eyebrow>{active ? t("fromResults") : t("activeSeed")}</Eyebrow>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
        <h2
          className="m-0 min-w-0 truncate text-[19px] font-semibold tracking-[-0.35px] text-fg"
          title={keyword}
        >
          {keyword}
        </h2>
        {active && metricsAvailable ? (
          <span
            className="rounded-full border px-2 py-0.5 font-sans tabular-nums text-[11px] font-semibold"
            style={difficultyPillStyle(active.difficulty)}
            title={t("difficultyTitle")}
          >
            {active.difficulty ?? "-"}
          </span>
        ) : active ? (
          <ResearchUnavailableMetric label={t("unavailableDifficulty")} />
        ) : null}
        {active ? <ResearchIntentChip intent={active.intent} /> : null}
      </div>

      {active ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric
              label={t("volume")}
              unavailableLabel={t("unavailableVolume")}
              unavailable={!metricsAvailable}
              value={metric(active.searchVolume, (value) => format.number(value))}
            />
            <Metric
              label={t("cpc")}
              unavailableLabel={t("unavailableCpc")}
              unavailable={!metricsAvailable}
              value={metric(active.cpcCents, formatEstimateCents)}
            />
            <Metric
              label={t("competition")}
              unavailableLabel={t("unavailableCompetition")}
              unavailable={!metricsAvailable}
              value={metric(active.competition, (value) => value.toFixed(2))}
            />
          </div>
          <div className="mt-5">
            <Eyebrow>{t("trend")}</Eyebrow>
            <div className="mt-2 h-[190px] min-w-0">
              {!metricsAvailable ? (
                <div className="grid h-full place-items-center rounded-control bg-bg-sunken">
                  <ResearchUnavailableMetric label={t("unavailableTrend")} />
                </div>
              ) : availableTrend.length > 1 ? (
                <TimeSeriesChart
                  height={190}
                  labels={labels}
                  series={[
                    {
                      label: t("trendSeries"),
                      values: trend,
                      color: "var(--accent)",
                      fill: true,
                      curve: "monotoneX",
                    },
                  ]}
                  max={trendMax}
                  areaOpacity={0.12}
                  strokeWidth={2}
                  showGrid={false}
                  showYAxis={false}
                  xTickIndexes={labels.flatMap((_, index) => (index % 2 === 0 ? [index] : []))}
                  margin={{ top: 4, right: 6, bottom: 0, left: 6 }}
                />
              ) : (
                <div className="grid h-full place-items-center rounded-control bg-bg-sunken text-[12px] text-fg-muted">
                  {t("noTrend")}
                </div>
              )}
            </div>
          </div>
          {active.variants.length > 1 ? (
            <div className="mt-5 border-t border-border pt-4">
              <Eyebrow>{t("variants")}</Eyebrow>
              <div className="mt-2 grid gap-1.5">
                {active.variants.map((variant) => (
                  <div className="flex justify-between gap-3 text-[12px]" key={variant.keyword}>
                    <span className="truncate text-fg-muted">{variant.keyword}</span>
                    <span className="font-sans tabular-nums text-fg-muted">
                      {metricsAvailable ? (
                        metric(variant.searchVolume, (value) => format.number(value))
                      ) : (
                        <ResearchUnavailableMetric label={t("variantVolume")} />
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mb-0 mt-2 text-[11px] leading-5 text-fg-muted">{t("variantHelp")}</p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-[12.5px] leading-5 text-fg-muted">{t("selectResult")}</p>
      )}

      {management ? (
        <div className="mt-5 border-t border-border pt-4">
          <Eyebrow>{t("tracking")}</Eyebrow>
          {active?.alreadyTracked ? (
            <p className="mb-0 mt-2 text-[12.5px] text-fg-muted">
              {t.rich("alreadyTracked", {
                keywords: (chunks) => (
                  <Link
                    className="font-semibold text-accent-text hover:underline"
                    href={appPath(management.projectId, "rank-tracker")}
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : (
            <>
              <div className="mt-3">
                <TrackingConfigurationFields
                  device={device}
                  idPrefix="research-detail-tracking"
                  labelsHidden
                  location={management.location}
                  onDeviceChange={setDevice}
                  onLocationChange={setLocation}
                  onScheduleChange={setScheduleFrequency}
                  projectDefaultFrequency={management.costContext.rawFrequency}
                  projectId={management.projectId}
                  scheduleFrequency={scheduleFrequency}
                  showSchedule
                />
              </div>
              <ResearchTrackingCostLine fact={management.line} />
              <Button
                onClick={() =>
                  management.onAdd({
                    device,
                    keywords: [keyword],
                    location: management.location,
                    scheduleFrequency,
                  })
                }
                startIcon={<Plus weight="regular" size={14} />}
                style={{ width: "100%" }}
              >
                {t("tracking")}
              </Button>
              {active ? (
                <ResearchDetailSaveAction
                  onSave={onSave}
                  projectRef={management.projectId}
                  row={active}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function Metric({
  label,
  unavailableLabel,
  unavailable,
  value,
}: Readonly<{ label: string; unavailableLabel: string; unavailable?: boolean; value: string }>) {
  return (
    <div className="rounded-control bg-bg-sunken p-3">
      <span className="block font-sans tabular-nums text-[9.5px] uppercase tracking-[0.4px] text-fg-muted">
        {label}
      </span>
      <strong className="mt-1 block font-sans tabular-nums text-[14px] text-fg">
        {unavailable ? <ResearchUnavailableMetric label={unavailableLabel} /> : value}
      </strong>
    </div>
  );
}
