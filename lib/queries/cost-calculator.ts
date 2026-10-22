import "server-only";
import {
  type EstimateFrequency,
  frequencyFromRankCheckFrequency,
} from "@/lib/cost-estimate/estimate";
import { rankCheckBudgetAmounts } from "@/lib/metering/rank-check-budget-read";
import { resolveSerpDepth, type SerpDepth } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";
import { requireReadableProject } from "./_auth";
import {
  getRequestKeywordCadences,
  getRequestKeywordDimensions,
  getRequestPrimarySerpProvider,
  getRequestProjectDefaults,
} from "./workspace-request-data";

export type CalculatorPrefillDevice = "desktop" | "mobile";

export type CalculatorPrefill = {
  depth: SerpDepth;
  keywordCount: number;
  locationCount: number;
  deviceCount: number;
  devices: CalculatorPrefillDevice[];
  frequency: EstimateFrequency;
  providerId: string | null;
  costPerCheckCents: number | null;
  projectName: string;
};

export type ProjectCostContext = CalculatorPrefill & {
  capCents: number;
  cronExpression: string | null;
  rawFrequency: RankCheckFrequency;
  spentCents: number;
  timezone?: string;
};

async function loadCalculatorContext(project: { id: string; name: string }) {
  const [dimensions, defaults, connection, memberships] = await Promise.all([
    getRequestKeywordDimensions(project.id),
    getRequestProjectDefaults(project.id),
    getRequestPrimarySerpProvider(project.id),
    getRequestKeywordCadences(project.id),
  ]);
  const frequencies = new Set(
    memberships.map(({ checkSchedule: schedule }) =>
      !schedule || schedule.archivedAt || !schedule.enabled ? "manual" : schedule.frequency,
    ),
  );
  const commonFrequency = frequencies.size === 1 ? [...frequencies][0] : "manual";

  const configuredCost =
    connection?.costPerCheckCents == null ? null : Number(connection.costPerCheckCents);

  const prefill: CalculatorPrefill = {
    costPerCheckCents:
      configuredCost != null && Number.isFinite(configuredCost) && configuredCost >= 0
        ? configuredCost
        : null,
    deviceCount: Math.max(1, dimensions.deviceCount),
    depth: resolveSerpDepth(defaults?.serpDepth),
    devices: dimensions.devices,
    // This what-if calculator supports monthly as its manual/mixed/cron fallback.
    frequency: frequencyFromRankCheckFrequency(commonFrequency ?? "manual"),
    keywordCount: dimensions.keywordCount,
    locationCount: Math.max(1, dimensions.locationCount),
    projectName: project.name,
    providerId: connection?.provider ?? null,
  };
  return {
    cronExpression: null,
    prefill,
    rawFrequency: "manual" as const,
    timezone: "UTC",
  };
}

export async function getCalculatorPrefill(projectId: string): Promise<CalculatorPrefill> {
  const { project } = await requireReadableProject(projectId);
  return (await loadCalculatorContext(project)).prefill;
}

export async function getProjectCostContext(projectId: string): Promise<ProjectCostContext> {
  const { project } = await requireReadableProject(projectId);
  const [context, reading] = await Promise.all([
    loadCalculatorContext(project),
    rankCheckBudgetAmounts(project.id),
  ]);
  return {
    ...context.prefill,
    capCents: reading.capCents,
    cronExpression: context.cronExpression,
    rawFrequency: context.rawFrequency,
    spentCents: reading.spentCents,
    timezone: context.timezone,
  };
}
