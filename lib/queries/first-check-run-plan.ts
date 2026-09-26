import "server-only";

import type { FirstCheckRunPlan } from "@/lib/actions/rank-check-preview-result";
import { estimateRankUsage } from "@/lib/cost-estimate/native-usage";
import { unitCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import { prisma } from "@/lib/db/prisma";
import { monthlySpendCents, projectBudgetCapCents } from "@/lib/rank-check/budget";
import { monthlyBudgetExhausted } from "@/lib/rank-check/budget-contract";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { activeMarketLocationIds, runnableKeywordWhere } from "@/lib/rank-check/runnable";
import {
  DEFAULT_SERP_DEPTH,
  resolveEffectiveSerpDepth,
  SERP_ENGINE,
  serpDepthValues,
} from "@/lib/serp/constants";
import { keywordMarketSelect, projectDefaultSerpMarket } from "@/lib/serp/default-market";

function previewSerpDepth(value: number | null | undefined) {
  return serpDepthValues.find((depth) => depth === value) ?? DEFAULT_SERP_DEPTH;
}

/**
 * The first-check run plan for a live project. The estimate covers exactly the targets a
 * launch would buy: non-archived, unchecked, runnable keywords in active markets, each at
 * its own effective depth (assigned schedule depth over the project default).
 */
export async function buildFirstCheckRunPlan(projectId: string): Promise<FirstCheckRunPlan> {
  const activeLocationIds = await activeMarketLocationIds(projectId, prisma);
  const runnable = runnableKeywordWhere(activeLocationIds);
  const [readyCount, connections, defaults, keywords, spentCents, capCents] = await Promise.all([
    prisma.keyword.count({
      where: { ...runnable, projectId, rankChecks: { none: { status: "completed" } } },
    }),
    loadSerpProviderChain(projectId),
    prisma.projectDefaults.findUnique({ where: { projectId } }),
    prisma.keyword.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        ...keywordMarketSelect,
        checkSchedule: { select: { serpDepth: true } },
        rankChecks: { select: { id: true }, take: 1, where: { status: "completed" } },
        schedule: { select: { serpDepth: true } },
      },
      where: { ...runnable, projectId },
    }),
    monthlySpendCents(projectId),
    projectBudgetCapCents(projectId),
  ]);
  const market = projectDefaultSerpMarket(defaults, keywords);
  const providers = connections.map((connection) => connection.provider);
  const depth = previewSerpDepth(defaults?.serpDepth);
  const nativeRate = {
    overrideCents:
      connections[0]?.costPerCheckCents == null ? null : Number(connections[0].costPerCheckCents),
    providerId: connections[0]?.provider ?? null,
    rateContext: connections[0]?.rateContext,
  };
  const readyDepths = keywords
    .filter((keyword) => !keyword.rankChecks?.length)
    .map((keyword) =>
      resolveEffectiveSerpDepth({
        checkScheduleDepth: keyword.checkSchedule?.serpDepth,
        projectDepth: defaults?.serpDepth,
        scheduleDepth: keyword.schedule?.serpDepth,
      }),
    );
  return {
    nativeEstimate: estimateRankUsage(readyDepths, nativeRate),
    firstTargetEstimate: estimateRankUsage(readyDepths.slice(0, 1), nativeRate),
    budget: { capCents, spentCents },
    budgetExhausted: monthlyBudgetExhausted(capCents, spentCents),
    estimatedCostPerCheckCents: unitCostCentsFor(nativeRate, depth),
    isSampleProject: false,
    providerReady: providers.length > 0,
    providers,
    readyCount,
    scope: {
      depth,
      device: market.device,
      engine: SERP_ENGINE.id,
      frequency: defaults?.frequency ?? "daily",
      location: market.displayName,
    },
  };
}
