import "server-only";

import {
  type EstimateFrequency,
  frequencyFromRankCheckFrequency,
} from "@/lib/cost-estimate/estimate";
import { resolveSerpDepth, type SerpDepth } from "@/lib/serp/markets";
import type { RankCheckFrequency } from "@/lib/settings/options";
import { requireReadableProject } from "./_auth";
import {
  getRequestKeywordDimensions,
  getRequestMonthlySpendCents,
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
  const [dimensions, defaults, connection] = await Promise.all([
    getRequestKeywordDimensions(project.id),
    getRequestProjectDefaults(project.id),
    getRequestPrimarySerpProvider(project.id),
  ]);

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
    // custom_cron intentionally collapses to "monthly" - v1 simplification.
    frequency: frequencyFromRankCheckFrequency(defaults?.frequency ?? "manual"),
    keywordCount: dimensions.keywordCount,
    locationCount: Math.max(1, dimensions.locationCount),
    projectName: project.name,
    providerId: connection?.provider ?? null,
  };
  return {
    cronExpression: defaults?.cronExpression ?? null,
    prefill,
    rawFrequency: defaults?.frequency ?? "manual",
    timezone: defaults?.timezone ?? "UTC",
  };
}

export async function getCalculatorPrefill(projectId: string): Promise<CalculatorPrefill> {
  const { project } = await requireReadableProject(projectId);
  return (await loadCalculatorContext(project)).prefill;
}

export async function getProjectCostContext(projectId: string): Promise<ProjectCostContext> {
  const { project } = await requireReadableProject(projectId);
  const [context, spentCents] = await Promise.all([
    loadCalculatorContext(project),
    getRequestMonthlySpendCents(project.id),
  ]);
  return {
    ...context.prefill,
    capCents: project.budgetCapCents,
    cronExpression: context.cronExpression,
    rawFrequency: context.rawFrequency,
    spentCents,
    timezone: context.timezone,
  };
}
