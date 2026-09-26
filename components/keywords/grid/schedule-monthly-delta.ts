import type { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { combineUsageEstimates, type NativeUsageEstimate } from "@/lib/cost-estimate/native-usage";
import {
  type CostRateInfo,
  monthlyCostCentsFor,
  monthlyNativeUsage,
  type ProjectEstimateVolume,
} from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { DEFAULT_SERP_DEPTH, resolveSerpDepth } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";
import type { useTranslations } from "next-intl";
import { effectiveRowDepth } from "./run-check-depth";
import type { CheckScheduleSummary } from "./set-schedule-model";

type ScheduleTranslations = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.management.schedule">
>;

export function scheduleFrequency(schedule: CheckScheduleSummary): RankCheckFrequency {
  return schedule.enabled ? schedule.frequency : "paused";
}

const singleTarget = { deviceCount: 1, keywordCount: 1, locationCount: 1 } as const;

function previousVolume(row: KeywordRow): ProjectEstimateVolume {
  return {
    ...singleTarget,
    cronExpression: row.schedule.cron_expression,
    depth: effectiveRowDepth(row),
    frequency: row.schedule.frequency,
  };
}

function destinationVolume(
  row: KeywordRow,
  schedule: CheckScheduleSummary | null,
): ProjectEstimateVolume {
  if (!schedule) {
    return {
      ...singleTarget,
      cronExpression: null,
      depth: row.projectSerpDepth ?? DEFAULT_SERP_DEPTH,
      frequency: "manual",
    };
  }
  return {
    ...singleTarget,
    cronExpression: schedule.cronExpression,
    depth: resolveSerpDepth(schedule.serpDepth ?? row.projectSerpDepth ?? DEFAULT_SERP_DEPTH),
    frequency: scheduleFrequency(schedule),
  };
}

function rowNativeDelta(
  row: KeywordRow,
  schedule: CheckScheduleSummary | null,
  rate: CostRateInfo,
): NativeUsageEstimate {
  const previous = monthlyNativeUsage(previousVolume(row), rate);
  const next = monthlyNativeUsage(destinationVolume(row, schedule), rate);
  return {
    ...next,
    quantity:
      previous.quantity === null || next.quantity === null
        ? null
        : Number((next.quantity - previous.quantity).toFixed(6)),
    unknownTargets: previous.unknownTargets + next.unknownTargets,
  };
}

function rowCentsDelta(
  row: KeywordRow,
  schedule: CheckScheduleSummary | null,
  rate: CostRateInfo,
): number | null {
  const previous = monthlyCostCentsFor(previousVolume(row), rate);
  const next = monthlyCostCentsFor(destinationVolume(row, schedule), rate);
  return previous == null || next == null ? null : next - previous;
}

/**
 * Monthly change caused by moving the selection to a schedule. The previous side keeps each
 * row's current schedule frequency, cron, and effective depth; the destination side uses the
 * chosen schedule's cadence and its own depth (falling back to the project depth, never the
 * old schedule override). Removal means manual, so zero scheduled runs. Quota providers are
 * priced in upper-bound operations per effective target depth; metered providers keep their
 * configured cents. Unknown providers stay unknown instead of inheriting a plan price.
 */
export function scheduleMonthlyDeltaLabel(input: {
  currentScheduleId: string | null;
  providerRate: CostRateInfo | undefined;
  rows: readonly KeywordRow[];
  schedule: CheckScheduleSummary | null;
  t: ScheduleTranslations;
  usage: ReturnType<typeof useNativeUsageFormat>;
}): string {
  const { currentScheduleId, providerRate, rows, schedule, t, usage } = input;
  if (!schedule && !currentScheduleId && !rows.some((row) => row.checkSchedule)) {
    return t("monthlyNoSpend");
  }
  if (!providerRate) return t("monthlyUnavailable");
  const native = combineUsageEstimates(
    rows.map((row) => rowNativeDelta(row, schedule, providerRate)),
  );
  if (native.unit === "units") {
    if (native.quantity === null) return t("monthlyUnavailable");
    if (native.quantity === 0) return t("monthlySame");
    const positive = native.quantity > 0;
    return t("monthlyDeltaUsage", {
      direction: positive ? "positive" : "negative",
      usage: usage.format({ ...native, quantity: Math.abs(native.quantity) }),
    });
  }
  const delta = rows
    .map((row) => rowCentsDelta(row, schedule, providerRate))
    .reduce<number | null>(
      (total, value) => (total == null || value == null ? null : total + value),
      0,
    );
  if (delta == null) return t("monthlyUnavailable");
  if (delta === 0) return t("monthlySame");
  if (Math.abs(delta) < 1) {
    return t("monthlyDeltaBelowCent", {
      direction: delta > 0 ? "positive" : "negative",
      minimum: 0.01,
    });
  }
  return t("monthlyDelta", {
    cost: Math.abs(delta) / 100,
    direction: delta > 0 ? "positive" : "negative",
  });
}
