import "server-only";

import { nativeEstimateFromSelection } from "@/lib/cost-estimate/native-usage";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { scheduledRunProjection, scheduleProviderId } from "@/lib/queries/check-schedule-list";
import {
  ledgerActualCostCents,
  type RunLedgerActual,
  rankCheckRunLedgerActuals,
} from "@/lib/queries/rank-check-run-accounting";
import { rankCheckRunUsageGroups } from "@/lib/queries/rank-check-run-usage";
import { monthlySpendCents } from "@/lib/rank-check/budget";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { readActiveSearchImportSnapshot } from "@/lib/search-insights/sync/operation-snapshot";
import { type OperationSnapshot, operationSnapshotSchema } from "./contract";
import { rankCheckProviderPresentation } from "./provider-presentation";
import { pendingRunItems, runStartFacts, startedRunItemWhere } from "./start-facts";
import { type RunUsageGroup, runUsage } from "./usage";

const ACTIVE_RUN_STATUSES = ["queued", "running", "cancelling", "blocked"];
const snapshotRunSelect = {
  _count: {
    select: {
      items: { where: startedRunItemWhere },
    },
  },
  id: true,
  blockedReason: true,
  cancelledCount: true,
  checkSchedule: {
    select: {
      id: true,
      frequency: true,
      timeOfDay: true,
      jitterMinutes: true,
      providerPolicy: true,
      serpDepth: true,
    },
  },
  completedCount: true,
  costCents: true,
  deferredCount: true,
  estimatedCostCents: true,
  failedCount: true,
  finishedAt: true,
  items: pendingRunItems,
  keywordCount: true,
  launchedAt: true,
  outcome: true,
  parentRun: { select: { publicId: true } },
  plannedFor: true,
  project: { select: { budgetCapCents: true, defaults: { select: { serpDepth: true } } } },
  projectId: true,
  publicId: true,
  requestedCount: true,
  selectionKind: true,
  selectionSpec: true,
  skippedCount: true,
  startedAt: true,
  status: true,
  targetCount: true,
  totalCount: true,
  trigger: true,
} satisfies Prisma.RankCheckRunSelect;

type SnapshotRun = Prisma.RankCheckRunGetPayload<{ select: typeof snapshotRunSelect }>;

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function operationEtaSeconds(
  counts: {
    cancelled: number;
    completed: number;
    deferred: number;
    failed: number;
    total: number;
    skipped?: number;
  },
  startedAt: Date | null,
  snapshotAt: Date,
): number | null {
  if (!startedAt || counts.completed < 3) return null;
  const elapsedSeconds = (snapshotAt.getTime() - startedAt.getTime()) / 1_000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 30) return null;

  const processed =
    counts.completed + counts.failed + counts.deferred + counts.cancelled + (counts.skipped ?? 0);
  const remaining = Math.max(counts.total - processed, 0);
  if (remaining === 0) return null;

  return Math.max(1, Math.round((remaining * elapsedSeconds) / counts.completed));
}

async function operationForRun(
  run: SnapshotRun,
  usageGroups: RunUsageGroup[],
  ledger: RunLedgerActual | undefined,
  snapshotAt: Date,
  budget: { capCents: number; spentCents: number } | null,
) {
  const counts = {
    cancelled: run.cancelledCount,
    completed: run.completedCount,
    deferred: run.deferredCount,
    failed: run.failedCount,
    requested: run.requestedCount,
    skipped: run.skippedCount,
    total: run.totalCount,
  };
  const operation = {
    blockedReason: run.blockedReason,
    budget: run.blockedReason === "budget_exhausted" ? budget : null,
    costCents: ledgerActualCostCents(ledger, run.costCents),
    usage: runUsage({ ...run, startedTargets: run._count.items }, usageGroups, ledger),
    counts,
    etaSeconds: operationEtaSeconds(counts, run.startedAt, snapshotAt),
    estimatedCostCents: run.estimatedCostCents,
    nativeEstimate: nativeEstimateFromSelection(run.selectionSpec),
    finishedAt: iso(run.finishedAt),
    id: run.publicId,
    keywordCount: run.keywordCount,
    kind: "rank_check" as const,
    ...runStartFacts(run),
    outcome: run.outcome,
    parentRunId: run.parentRun?.publicId ?? null,
    plannedFor: iso(run.plannedFor),
    ...rankCheckProviderPresentation(run.selectionSpec),
    selectionKind: run.selectionKind,
    snapshotAt: snapshotAt.toISOString(),
    startedAt: iso(run.startedAt),
    status: run.status,
    targetCount: run.targetCount,
    trigger: run.trigger,
  };
  if (run.status !== "blocked" || run.launchedAt !== null || !run.checkSchedule) {
    return operation;
  }
  const keywords = await prisma.keyword.findMany({
    select: { device: true, locationId: true, text: true },
    where: { checkScheduleId: run.checkSchedule.id },
  });
  const providers = await loadSerpProviderChain(
    run.projectId,
    scheduleProviderId(run.checkSchedule.providerPolicy),
  );
  const projection = scheduledRunProjection(
    { ...run.checkSchedule, keywords },
    run.project.defaults?.serpDepth,
    providers[0],
  );
  return {
    ...operation,
    counts: {
      cancelled: 0,
      completed: 0,
      deferred: 0,
      failed: 0,
      requested: projection.targetCount,
      skipped: 0,
      total: projection.targetCount,
    },
    estimatedCostCents: projection.estimatedCostCents ?? 0,
    nativeEstimate: projection.nativeEstimate,
    keywordCount: projection.keywordCount,
    targetCount: projection.targetCount,
  };
}

export async function readOperationSnapshot(projectId: string): Promise<OperationSnapshot[]> {
  const snapshotAt = new Date();
  const [runs, searchImport] = await Promise.all([
    prisma.rankCheckRun.findMany({
      orderBy: [{ launchedAt: "desc" }, { id: "desc" }],
      select: snapshotRunSelect,
      take: 50,
      where: { projectId, status: { in: ACTIVE_RUN_STATUSES } },
    }),
    readActiveSearchImportSnapshot(projectId),
  ]);

  const spentCents = runs.some((run) => run.blockedReason === "budget_exhausted")
    ? await monthlySpendCents(projectId, snapshotAt)
    : null;
  const [usageGroups, ledgerActuals] = await Promise.all([
    rankCheckRunUsageGroups(runs.map((run) => run.id)),
    rankCheckRunLedgerActuals(
      projectId,
      runs.map((run) => run.id),
    ),
  ]);
  const operations = [
    ...(await Promise.all(
      runs.map((run) =>
        operationForRun(
          run,
          usageGroups.get(run.id) ?? [],
          ledgerActuals.get(run.id),
          snapshotAt,
          run.blockedReason === "budget_exhausted" && spentCents !== null
            ? { capCents: run.project.budgetCapCents, spentCents }
            : null,
        ),
      ),
    )),
    ...(searchImport
      ? [
          {
            capabilities: searchImport.capabilities,
            id: searchImport.id,
            kind: "gsc_import" as const,
            presentation: {
              action: searchImport.presentation.action,
              supportingText: searchImport.presentation.supportingText,
              title: searchImport.presentation.title,
            },
            progress: searchImport.progress,
            property: searchImport.property,
            state: searchImport.state,
          },
        ]
      : []),
  ];

  return operationSnapshotSchema.array().parse(operations);
}
