import "server-only";

import {
  type getActionActor,
  ProjectNotFoundError,
  requireProjectScope,
} from "@/lib/actions/_shared";
import type { GetRankCheckStatusResult } from "@/lib/actions/rank-check-status";
import { AuthorizationError } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

const runSelect = {
  publicId: true,
  status: true,
  outcome: true,
  blockedReason: true,
  finishedAt: true,
  project: { select: { publicId: true } },
  items: {
    take: 1,
    select: {
      status: true,
      blockedReason: true,
      rankCheck: {
        select: {
          status: true,
          error: true,
          errorCode: true,
          position: true,
          requestedDepth: true,
          finishedAt: true,
        },
      },
    },
  },
} satisfies Prisma.RankCheckRunSelect;

type Run = Prisma.RankCheckRunGetPayload<{ select: typeof runSelect }>;

function runStatus(run: Run): GetRankCheckStatusResult {
  const item = run.items[0];
  if (item?.rankCheck) {
    return { ...item.rankCheck, finishedAt: item.rankCheck.finishedAt?.toISOString() ?? null };
  }
  const terminal =
    run.status === "completed" || run.status === "cancelled" || run.status === "blocked";
  const skipped = run.status === "cancelled" || run.outcome === "deferred";
  return {
    status: terminal ? (skipped ? "deferred" : "failed") : "running",
    errorCode: item?.blockedReason ?? run.blockedReason,
    error: null,
    position: null,
    requestedDepth: null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

export async function singleRankCheckRunStatus(
  publicId: string,
  actor: Awaited<ReturnType<typeof getActionActor>>,
): Promise<GetRankCheckStatusResult> {
  const run = await prisma.rankCheckRun.findFirst({
    where: { publicId, deletedAt: null, selectionKind: "single" },
    select: runSelect,
  });
  if (!run) throw new Error("Rank check not found.");
  try {
    await requireProjectScope(
      actor,
      "read",
      run.project.publicId,
      { type: "project" },
      { allowReadOnly: true },
    );
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof ProjectNotFoundError) {
      throw new Error("Rank check not found.");
    }
    throw error;
  }
  return runStatus(run);
}

/** The caller has authorized this project; preserve it in the batch query. */
export async function singleRankCheckRunStatuses(publicIds: string[], projectId: string) {
  if (publicIds.length === 0) return [];
  const runs = await prisma.rankCheckRun.findMany({
    where: { publicId: { in: publicIds }, projectId, deletedAt: null, selectionKind: "single" },
    select: runSelect,
  });
  return runs.map((run) => ({ ...runStatus(run), rankCheckId: run.publicId }));
}
