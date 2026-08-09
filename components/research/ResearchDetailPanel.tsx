"use client";

import {
  TrackingConfigurationFields,
  type TrackingConfigurationValue,
  type TrackingScheduleSelection,
} from "@/components/keywords/add/TrackingConfigurationFields";
import { Button, Card } from "@/components/ui";
import { formatEstimateCents, monthlyCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { appPath } from "@/lib/routing/app-path";
import { chartColors } from "@/lib/theme/chart-colors";
import { LineChart } from "@mui/x-charts/LineChart";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { ResearchDetailSaveAction } from "./ResearchDetailSaveAction";
import {
  chronologicalTrend,
  difficultyPillStyle,
  IntentChip,
  MONTH_LABELS,
} from "./research-results-model";
import type { ResearchAddDraft } from "./research-workspace-model";

type ResearchDetailPanelProps = {
  active: GroupedResearchRow | null;
  defaultTracking: TrackingConfigurationValue;
  onAdd: (draft: ResearchAddDraft) => void;
  onSave?: (row: GroupedResearchRow) => void;
  projectId: string;
  seed: string;
  costContext: ProjectCostContext;
};

const axisTextStyle = {
  fill: "var(--fg-muted)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: 10,
};

function metric(value: number | null, formatter = (item: number) => String(item)) {
  return value == null ? "-" : formatter(value);
}

function trackingCost(context: ProjectCostContext, schedule: TrackingScheduleSelection) {
  const frequency = schedule === "project_default" ? context.rawFrequency : schedule;
  return monthlyCostCentsFor(
    {
      cronExpression: schedule === "project_default" ? context.cronExpression : null,
      depth: context.depth,
      deviceCount: 1,
      frequency,
      keywordCount: 1,
      locationCount: 1,
    },
    { overrideCents: context.costPerCheckCents, providerId: context.providerId },
  );
}

function costLine(
  context: ProjectCostContext,
  schedule: TrackingScheduleSelection,
  cost: number | null,
): { emphasis: string | null; lead: string; tail: string } {
  const frequency = schedule === "project_default" ? context.rawFrequency : schedule;
  if (frequency === "manual" || frequency === "paused") {
    return { emphasis: "$0/mo", lead: "Tracking cost: scheduled spend ", tail: "." };
  }
  if (cost == null) {
    return {
      emphasis: null,
      lead:
        frequency === "custom_cron"
          ? "Tracking cost excludes the custom cron schedule."
          : `Tracking estimate: 1 keyword, 1 location, ${frequency.replace("_", " ")}.`,
      tail: "",
    };
  }
  const frequencyLabel =
    schedule === "project_default" ? `project default, ${frequency}` : frequency;
  return {
    emphasis: `~${formatEstimateCents(cost)}`,
    lead: "Tracking cost: ",
    tail: `/month at ${frequencyLabel.replace("_", " ")} checks, billed to your own account.`,
  };
}

function Eyebrow({ children }: Readonly<{ children: string }>) {
  return (
    <p className="m-0 font-mono text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
      {children}
    </p>
  );
}

export function ResearchDetailPanel({
  active,
  costContext,
  defaultTracking,
  onAdd,
  onSave,
  projectId,
  seed,
}: Readonly<ResearchDetailPanelProps>) {
  const [device, setDevice] = useState(defaultTracking.device);
  const [location, setLocation] = useState(defaultTracking.location);
  const [scheduleFrequency, setScheduleFrequency] = useState(defaultTracking.scheduleFrequency);
  const keyword = active?.keyword ?? seed;
  const cost = trackingCost(costContext, scheduleFrequency);
  const line = costLine(costContext, scheduleFrequency, cost);
  const points = chronologicalTrend(active?.monthlyTrend ?? []);
  const labels = points.map((point) => MONTH_LABELS[point.month - 1] ?? String(point.month));
  const trend = points.map((point) => point.searchVolume);
  const availableTrend = trend.filter((value): value is number => value != null);
  const peak = Math.max(...availableTrend, 0);
  // Headroom above the peak so the line and area are never clipped at the plot edge.
  const trendMax = peak > 0 ? peak * 1.1 : undefined;

  return (
    <Card className="min-w-0 lg:sticky lg:top-4 lg:self-start" size="lg">
      <Eyebrow>{active ? "From results" : "Active seed"}</Eyebrow>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
        <h2
          className="m-0 min-w-0 truncate text-[19px] font-semibold tracking-[-0.35px] text-fg"
          title={keyword}
        >
          {keyword}
        </h2>
        {active ? (
          <span
            className="rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold"
            style={difficultyPillStyle(active.difficulty)}
            title={`Keyword difficulty ${active.difficulty ?? "-"}`}
          >
            {active.difficulty ?? "-"}
          </span>
        ) : null}
        {active ? <IntentChip intent={active.intent} /> : null}
      </div>

      {active ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric
              label="Volume"
              value={metric(active.searchVolume, (value) => value.toLocaleString("en-US"))}
            />
            <Metric label="CPC" value={metric(active.cpcCents, formatEstimateCents)} />
            <Metric
              label="Competition"
              value={metric(active.competition, (value) => value.toFixed(2))}
            />
          </div>
          <div className="mt-5">
            <Eyebrow>12-month trend</Eyebrow>
            <div className="mt-2 h-[190px] min-w-0">
              {availableTrend.length > 1 ? (
                <LineChart
                  height={190}
                  hideLegend
                  margin={{ top: 4, right: 6, bottom: 18, left: 6 }}
                  series={[
                    {
                      area: true,
                      color: chartColors.accent,
                      connectNulls: false,
                      curve: "monotoneX",
                      data: trend,
                      label: "Search volume",
                      showMark: false,
                    },
                  ]}
                  skipAnimation
                  sx={{
                    "& .MuiAreaElement-root": { fill: "var(--accent)", fillOpacity: 0.12 },
                    "& .MuiLineElement-root": { stroke: "var(--accent)", strokeWidth: 2 },
                    "& .MuiChartsAxis-tickLabel": axisTextStyle,
                  }}
                  xAxis={[
                    {
                      data: labels,
                      disableLine: true,
                      disableTicks: true,
                      scaleType: "point",
                      tickInterval: (_, index) => index % 2 === 0,
                      tickLabelStyle: axisTextStyle,
                    },
                  ]}
                  yAxis={[{ max: trendMax, min: 0, position: "none" }]}
                />
              ) : (
                <div className="grid h-full place-items-center rounded-[10px] bg-bg-sunken text-[12px] text-fg-muted">
                  No monthly trend available
                </div>
              )}
            </div>
          </div>
          {active.variants.length > 1 ? (
            <div className="mt-5 border-t border-border pt-4">
              <Eyebrow>Variants, grouped</Eyebrow>
              <div className="mt-2 grid gap-1.5">
                {active.variants.map((variant) => (
                  <div className="flex justify-between gap-3 text-[12px]" key={variant.keyword}>
                    <span className="truncate text-fg-muted">{variant.keyword}</span>
                    <span className="font-mono text-fg-muted">
                      {metric(variant.searchVolume, (value) => value.toLocaleString("en-US"))}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mb-0 mt-2 text-[11px] leading-5 text-fg-muted">
                Variants share one Google volume unless clickstream volumes are on.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-[12.5px] leading-5 text-fg-muted">
          Select a result row to inspect provider metrics and grouped variants.
        </p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <Eyebrow>Add to tracking</Eyebrow>
        {active?.alreadyTracked ? (
          <p className="mb-0 mt-2 text-[12.5px] text-fg-muted">
            Already tracked.{" "}
            <Link
              className="font-semibold text-accent-text hover:underline"
              href={appPath(projectId, "keywords")}
            >
              Open in the keyword grid
            </Link>
          </p>
        ) : (
          <>
            <div className="mt-3">
              <TrackingConfigurationFields
                device={device}
                idPrefix="research-detail-tracking"
                labelsHidden
                location={location}
                onDeviceChange={setDevice}
                onLocationChange={setLocation}
                onScheduleChange={setScheduleFrequency}
                projectDefaultFrequency={costContext.rawFrequency}
                projectId={projectId}
                scheduleFrequency={scheduleFrequency}
                showSchedule
              />
            </div>
            <p className="mb-3 mt-2 font-mono text-[11.5px] leading-5 text-fg-muted">
              {line.lead}
              {line.emphasis ? <span className="text-fg">{line.emphasis}</span> : null}
              {line.tail}
            </p>
            <Button
              onClick={() => onAdd({ device, keywords: [keyword], location, scheduleFrequency })}
              startIcon={<Plus size={14} />}
              sx={{ width: "100%" }}
            >
              Add to tracking
            </Button>
            {active ? (
              <ResearchDetailSaveAction onSave={onSave} projectRef={projectId} row={active} />
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-[10px] bg-bg-sunken p-3">
      <span className="block font-mono text-[9.5px] uppercase tracking-[0.4px] text-fg-muted">
        {label}
      </span>
      <strong className="mt-1 block font-mono text-[14px] text-fg">{value}</strong>
    </div>
  );
}
