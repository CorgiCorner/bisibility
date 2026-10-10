import "server-only";

import { whereCompletedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { normalizedObservationCompleteness } from "@/lib/serp/rank-depth";
import { requireApiPublicId } from "./public-id";

export const RANK_CHECK_COMPLETED_STATUS = "completed";
export const RANK_CHECK_FAILED_STATUS = "failed";
export const RANK_CHECK_RUNNING_STATUS = "running";

export function apiRankCheckStatus(status: string) {
  if (
    status === RANK_CHECK_COMPLETED_STATUS ||
    status === RANK_CHECK_FAILED_STATUS ||
    status === RANK_CHECK_RUNNING_STATUS
  ) {
    return status;
  }
  throw new Error("Rank check status is not API-visible.");
}

export type LatestExecutedCheckInput = {
  checkedAt: Date;
  errorCode: string | null;
  error: string | null;
  observationRun?: { completeness: string } | null;
  position: number | null;
  publicId: string;
  run: { publicId: string } | null;
  status: string;
};

export type LatestSuccessfulCheckRecord = {
  checkedAt: Date;
  keywordId: string;
  observationRun?: { completeness: string } | null;
  position: number | null;
  publicId: string;
  rankingUrl: string | null;
  run: { publicId: string } | null;
};

const latestSuccessfulCheckSelect = {
  checkedAt: true,
  keywordId: true,
  observationRun: { select: { completeness: true } },
  position: true,
  publicId: true,
  rankingUrl: true,
  run: { select: { publicId: true } },
} satisfies Prisma.RankCheckSelect;

/**
 * Two bounded queries per page for the latest completed check per keyword.
 * Never call this once per keyword.
 */
export async function loadLatestSuccessfulChecks(keywordIds: readonly string[]) {
  if (keywordIds.length === 0) {
    return new Map<string, LatestSuccessfulCheckRecord>();
  }
  const groups = await prisma.rankCheck.groupBy({
    _max: { checkedAt: true },
    by: ["keywordId"],
    where: { ...whereCompletedChecks(), keywordId: { in: [...keywordIds] } },
  });
  const latest = groups.flatMap((group) => {
    const { checkedAt } = group._max;
    return checkedAt === null ? [] : [{ checkedAt, keywordId: group.keywordId }];
  });
  if (latest.length === 0) {
    return new Map<string, LatestSuccessfulCheckRecord>();
  }
  const rows = await prisma.rankCheck.findMany({
    select: latestSuccessfulCheckSelect,
    where: {
      OR: latest.map((pair) => ({ keywordId: pair.keywordId, checkedAt: pair.checkedAt })),
      ...whereCompletedChecks(),
    },
  });
  return new Map<string, LatestSuccessfulCheckRecord>(rows.map((row) => [row.keywordId, row]));
}

/** The most recent executed check of any status. */
export function latestCheckState(check: LatestExecutedCheckInput | null | undefined) {
  if (!check) {
    return null;
  }
  return {
    checked_at: check.checkedAt.toISOString(),
    error: check.error,
    error_code: check.errorCode,
    id: requireApiPublicId(check.publicId, "check"),
    observation_completeness: normalizedObservationCompleteness(check.observationRun?.completeness),
    position: check.position,
    run_id: check.run ? requireApiPublicId(check.run.publicId, "rcr") : null,
    status: apiRankCheckStatus(check.status),
  };
}

/** The most recent check with status completed, i.e. the last known ranking. */
export function latestSuccessfulCheckState(check: LatestSuccessfulCheckRecord | null | undefined) {
  if (!check) {
    return null;
  }
  return {
    checked_at: check.checkedAt.toISOString(),
    id: requireApiPublicId(check.publicId, "check"),
    observation_completeness: normalizedObservationCompleteness(check.observationRun?.completeness),
    position: check.position,
    ranking_url: check.rankingUrl,
    run_id: check.run ? requireApiPublicId(check.run.publicId, "rcr") : null,
  };
}
