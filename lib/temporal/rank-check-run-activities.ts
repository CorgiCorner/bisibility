import "server-only";

import { prisma } from "../db/prisma";
import { reconcileRankCheckRuns } from "../rank-check/runs/reconcile";
import { plannerOwnsAutomaticChecks } from "../rank-check/scheduler-mode";
import { resolveEffectiveSerpDepth, type SerpDepth, serpDepthValues } from "../serp/constants";
import { rankCheckRunWorkflowGateway } from "./rank-check-run-workflow-gateway";

export type ReconcileRankCheckRunsActivityInput = {
  limit?: number;
  sweepAt?: string;
};

export type ReconcileRankCheckRunsActivityResult = {
  hasMore: boolean;
  reconciled: number;
  sweepAt: string;
};

export type RankCheckRunItemCursor = { id: string; notBefore: string | null };
export type LoadRankCheckRunItemsActivityInput = {
  cursor?: RankCheckRunItemCursor | null;
  limit?: number;
  runId: string;
};
export type LoadedRankCheckRunItem = {
  depth: SerpDepth;
  id: string;
  keywordId: string;
  notBefore: string | null;
  projectId: string;
  providerId?: string;
  runId: string;
};
export type LoadRankCheckRunItemsActivityResult = {
  hasMore: boolean;
  items: LoadedRankCheckRunItem[];
  nextCursor: RankCheckRunItemCursor | null;
};

function executionSpec(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { depth: undefined, providerId: undefined };
  }
  const spec = value as { depth?: unknown; providerId?: unknown };
  return {
    depth: serpDepthValues.includes(spec.depth as SerpDepth)
      ? (spec.depth as SerpDepth)
      : undefined,
    providerId:
      typeof spec.providerId === "string" && spec.providerId.length > 0
        ? spec.providerId
        : undefined,
  };
}

function afterCursor(cursor: RankCheckRunItemCursor | null | undefined) {
  if (!cursor) return {};
  if (cursor.notBefore === null) {
    return {
      OR: [{ id: { gt: cursor.id }, notBefore: null }, { notBefore: { not: null } }],
    };
  }
  const notBefore = new Date(cursor.notBefore);
  return {
    OR: [{ notBefore: { gt: notBefore } }, { id: { gt: cursor.id }, notBefore }],
  };
}

export async function loadRankCheckRunItemsActivity(
  input: LoadRankCheckRunItemsActivityInput,
): Promise<LoadRankCheckRunItemsActivityResult> {
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 200);
  const run = await prisma.rankCheckRun.findUnique({
    select: {
      project: { select: { defaults: { select: { serpDepth: true } } } },
      projectId: true,
      selectionKind: true,
      selectionSpec: true,
    },
    where: { id: input.runId },
  });
  if (!run) throw new Error("Rank-check run not found.");
  if (run.selectionKind === "scheduled_due" && plannerOwnsAutomaticChecks()) {
    // The dispatcher marks the run started when it claims its first due target.
    return { hasMore: false, items: [], nextCursor: null };
  }
  const spec = executionSpec(run.selectionSpec);
  const rows = await prisma.rankCheckRunItem.findMany({
    orderBy: [{ notBefore: { nulls: "first", sort: "asc" } }, { id: "asc" }],
    select: {
      id: true,
      keyword: {
        select: {
          checkSchedule: { select: { serpDepth: true } },
          schedule: { select: { serpDepth: true } },
        },
      },
      keywordId: true,
      notBefore: true,
    },
    take: limit + 1,
    where: { runId: input.runId, status: "queued", ...afterCursor(input.cursor) },
  });
  const items = rows.slice(0, limit).map((row) => ({
    depth: resolveEffectiveSerpDepth({
      projectDepth: run.project.defaults?.serpDepth,
      requestedDepth: spec.depth,
      checkScheduleDepth: row.keyword.checkSchedule?.serpDepth,
      scheduleDepth: row.keyword.schedule?.serpDepth,
    }),
    id: row.id,
    keywordId: row.keywordId,
    notBefore: row.notBefore?.toISOString() ?? null,
    projectId: run.projectId,
    ...(spec.providerId ? { providerId: spec.providerId } : {}),
    runId: input.runId,
  }));
  const last = items.at(-1);
  return {
    hasMore: rows.length > limit,
    items,
    nextCursor: last ? { id: last.id, notBefore: last.notBefore } : null,
  };
}

export async function reconcileRankCheckRunsActivity(
  input: ReconcileRankCheckRunsActivityInput = {},
): Promise<ReconcileRankCheckRunsActivityResult> {
  const summary = await reconcileRankCheckRuns(
    {
      limit: input.limit ?? 100,
      now: input.sweepAt ? new Date(input.sweepAt) : new Date(),
    },
    prisma,
    rankCheckRunWorkflowGateway,
  );
  return { ...summary, sweepAt: summary.sweepAt.toISOString() };
}
