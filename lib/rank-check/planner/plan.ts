import "server-only";

import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { connectionFunding } from "@/lib/metering/project-funding-budgets";
import { isOperationAccessDeniedError } from "@/lib/operations/access-error";
import { assertOperationAccess } from "@/lib/operations/access-extension";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { loadNativeRankRequestCosts } from "@/lib/provider-rates/native-rank-request";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { queuedRankCheckConfig } from "@/lib/rank-check/queued-config";
import { queuedRankCheckRoute } from "@/lib/rank-check/queued-routing";
import { hostedReservationCustomerCents } from "@/lib/rank-check/runs/customer-charge";
import { resolveEffectiveSerpDepth } from "@/lib/serp/constants";
import { skipEmptyScheduleOccurrences } from "./empty-schedule";
import { plannedOccurrences } from "./occurrence";
import { persistOccurrence } from "./persist-occurrence";
import { cancelObsoleteScheduleItems } from "./reconcile-scheduled-items";

const MAX_SCHEDULE_PAGE = 200;

const plannerScheduleSelect = {
  createdAt: true,
  cronExpression: true,
  enabled: true,
  frequency: true,
  id: true,
  jitterMinutes: true,
  keywords: {
    where: { archivedAt: null },
    orderBy: { id: "asc" as const },
    select: { id: true, publicId: true, locationId: true },
  },
  project: {
    select: {
      defaults: { select: { timezone: true } },
      markets: { where: { status: "active" as const }, select: { locationId: true } },
    },
  },
  projectId: true,
  publicId: true,
  timeOfDay: true,
  timezone: true,
} as const;

export type PlannerSchedule = Awaited<
  ReturnType<typeof prisma.checkSchedule.findMany<{ select: typeof plannerScheduleSelect }>>
>[number];

type ScheduleAdmissionInput = {
  keywords: readonly { id: string; text: string }[];
  project: {
    defaults: { serpDepth: number } | null;
  };
  projectId: string;
  providerPolicy: string | null;
  serpDepth: number | null;
};

export type PlanRankCheckRunsInput = { cursor?: string | null; limit?: number; now?: Date };
export type PlanRankCheckRunsResult = {
  blocked: number;
  cursor: string | null;
  done: boolean;
  planned: number;
  schedules: number;
};

function boundedLimit(value?: number) {
  if (!Number.isFinite(value)) return MAX_SCHEDULE_PAGE;
  return Math.min(MAX_SCHEDULE_PAGE, Math.max(1, Math.floor(value ?? MAX_SCHEDULE_PAGE)));
}

export async function scheduleAdmission(
  schedule: ScheduleAdmissionInput,
  now: Date,
  client?: Prisma.TransactionClient,
) {
  try {
    // Admission comes first: a denied schedule stays blocked under a neutral
    // reason until the owner's entitlement returns, and nothing here marks a
    // provider bad, alters a connection, or spends budget.
    await assertOperationAccess(schedule.projectId);
  } catch (error) {
    if (isOperationAccessDeniedError(error)) {
      return {
        blockedReason: "operation_unavailable" as const,
        connection: null,
        estimatedCostCents: 0,
        itemCosts: schedule.keywords.map(() => null),
        usageQuantity: 0,
      };
    }
    throw error;
  }
  const route = await queuedRankCheckRoute({ projectId: schedule.projectId }, client);
  const connections =
    route.mode === "deferred"
      ? []
      : await loadSerpProviderChain(
          schedule.projectId,
          route.mode === "queued" || schedule.providerPolicy === "project"
            ? undefined
            : (schedule.providerPolicy ?? undefined),
          client,
        );
  const connection = connections[0];
  if (!connection) {
    return {
      blockedReason: "no_provider" as const,
      connection: null,
      estimatedCostCents: 0,
      itemCosts: schedule.keywords.map(() => null),
      usageQuantity: 0,
    };
  }
  const depth = resolveEffectiveSerpDepth({
    projectDepth: schedule.project.defaults?.serpDepth,
    scheduleDepth: schedule.serpDepth,
  });
  const priority = route.mode === "queued" ? queuedRankCheckConfig().priority : undefined;
  const itemCosts =
    (await loadNativeRankRequestCosts(
      client ?? prisma,
      { ...connection, credentialsEncrypted: connection.credentialsEncrypted ?? null },
      schedule.keywords.map(({ text }) => ({
        keyword: text,
        depth,
        ...(priority ? { priority } : {}),
      })),
      now,
    )) ??
    schedule.keywords.map(() =>
      estimatedRankCheckCostCents(
        connection.provider,
        depth,
        connection.costPerCheckCents,
        connection.credentialSource === "hosted"
          ? LIST_PROVIDER_RATE_CONTEXT
          : (connection.rateContext ?? LIST_PROVIDER_RATE_CONTEXT),
      ),
    );
  const estimatedCostCents = Math.ceil(
    itemCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0),
  );
  if (itemCosts.some((cost) => cost === null))
    return {
      blockedReason: "pricing_unavailable" as const,
      connection,
      estimatedCostCents,
      itemCosts,
      usageQuantity: schedule.keywords.length * pagesPerCheck(depth),
      depth,
    };
  const funding = connectionFunding(connection.credentialSource);
  const estimatedCustomerCents =
    funding === "platform"
      ? await hostedReservationCustomerCents(
          {
            connection,
            projectId: schedule.projectId,
            source: "app",
            targets: schedule.keywords.map((keyword, index) => ({
              keywordId: keyword.id,
              cost: itemCosts[index] ?? null,
              depth,
            })),
          },
          client,
        )
      : undefined;
  try {
    await assertBudgetAvailable(schedule.projectId, now, {
      estimatedCostCents,
      ...(estimatedCustomerCents !== undefined ? { estimatedCustomerCents } : {}),
      funding,
      ...(client ? { client } : {}),
    });
    return {
      blockedReason: null,
      connection,
      estimatedCostCents,
      itemCosts,
      usageQuantity: schedule.keywords.length * pagesPerCheck(depth),
      depth,
    };
  } catch (error) {
    if (!isBudgetExhaustedError(error)) throw error;
    return {
      blockedReason: "budget_exhausted" as const,
      connection,
      estimatedCostCents,
      itemCosts,
      usageQuantity: schedule.keywords.length * pagesPerCheck(depth),
      depth,
    };
  }
}

async function planSchedule(schedule: PlannerSchedule, now: Date) {
  await prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, schedule.projectId);
    await cancelObsoleteScheduleItems(tx, schedule.id);
  });
  const activeLocations = new Set(schedule.project.markets.map((market) => market.locationId));
  schedule = {
    ...schedule,
    keywords: schedule.keywords.filter((keyword) => activeLocations.has(keyword.locationId)),
  };
  if (schedule.keywords.length === 0) {
    await skipEmptyScheduleOccurrences(schedule, now);
    return { blocked: 0, planned: 0 };
  }
  const effective = {
    ...schedule,
    timezone: schedule.timezone ?? schedule.project.defaults?.timezone ?? "UTC",
  };
  // Fixed-time schedules cannot predate creation; phased intervals keep their anchor.
  const occurrences = plannedOccurrences(effective, now).filter(
    (occurrence) => schedule.timeOfDay === null || occurrence.plannedFor >= schedule.createdAt,
  );
  if (occurrences.length === 0) return { blocked: 0, planned: 0 };
  let planned = 0;
  for (const occurrence of occurrences) {
    const runId = await persistOccurrence(schedule, occurrence, now);
    if (runId) planned += 1;
  }
  return { blocked: 0, planned };
}

export async function planRankCheckRuns(
  input: PlanRankCheckRunsInput = {},
): Promise<PlanRankCheckRunsResult> {
  const now = input.now ?? new Date();
  const limit = boundedLimit(input.limit);
  const rows = await prisma.checkSchedule.findMany({
    orderBy: { id: "asc" },
    select: plannerScheduleSelect,
    take: limit + 1,
    where: {
      archivedAt: null,
      enabled: true,
      frequency: { in: ["daily", "weekly", "monthly", "custom_cron"] },
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
    },
  });
  const schedules = rows.slice(0, limit);
  let blocked = 0;
  let planned = 0;
  for (const schedule of schedules) {
    const result = await planSchedule(schedule, now);
    blocked += result.blocked;
    planned += result.planned;
  }
  const done = rows.length <= limit;
  return {
    blocked,
    cursor: done ? null : (schedules.at(-1)?.id ?? null),
    done,
    planned,
    schedules: schedules.length,
  };
}
