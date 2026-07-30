import "server-only";

import { prisma } from "@/lib/db/prisma";
import { rankCheckDispatcherMaxKeywordsPerProject } from "./dispatcher-config";
import {
  advanceClaimedStates,
  type DispatchRow,
  type DispatchTransaction,
  oldestEligibleDueAt,
  selectFairDueStates,
} from "./dispatcher-query";
import { computeDispatcherNextCheckAt } from "./dispatcher-recurrence";
import type { ClaimDueRankChecksResult, ClaimedRankCheckGroup } from "./dispatcher-types";
import type { RankCheckScheduleInput } from "./schedule";
import { dispatcherClaimsAllowed } from "./scheduler-mode";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

type DispatchDatabase = {
  $transaction<T>(callback: (tx: DispatchTransaction) => Promise<T>): Promise<T>;
};

function boundedPageSize(pageSize?: number) {
  if (!Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE)));
}

function scheduleFromRow(row: DispatchRow): RankCheckScheduleInput {
  return {
    cronExpression: row.cronExpression,
    frequency: row.frequency,
    jitterMinutes: row.jitterMinutes,
    nextCheckAt: row.anchorCheckAt,
    timezone: row.timezone,
  };
}

function groupRows(
  rows: Array<DispatchRow & { advancedCheckAt: Date; stateVersion: string }>,
): ClaimedRankCheckGroup[] {
  const groups = new Map<string, ClaimedRankCheckGroup>();
  for (const row of rows) {
    const key = JSON.stringify([row.projectId, row.locationId, row.device]);
    const group = groups.get(key) ?? {
      claims: [],
      device: row.device,
      domain: row.domain,
      keywordIds: [],
      locationId: row.locationId,
      projectId: row.projectId,
    };
    group.claims.push({
      advancedCheckAt: row.advancedCheckAt.toISOString(),
      dueCheckAt: row.dueCheckAt.toISOString(),
      keywordId: row.keywordId,
      stateVersion: row.stateVersion,
    });
    group.keywordIds.push(row.keywordId);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function oldestDueLagMs(now: Date, oldestDueAt: Date | null) {
  if (!oldestDueAt) return null;
  return Math.max(0, now.getTime() - oldestDueAt.getTime());
}

function claimMetrics(
  rows: Array<DispatchRow & { advancedCheckAt: Date }>,
  now: Date,
  oldestBefore: Date | null,
  oldestAfter: Date | null,
): ClaimDueRankChecksResult["metrics"] {
  const perProject = new Map<string, number>();
  for (const row of rows) {
    perProject.set(row.projectId, (perProject.get(row.projectId) ?? 0) + 1);
  }
  return {
    distinctProjects: perProject.size,
    largestProjectClaim: Math.max(0, ...perProject.values()),
    oldestDueLagMsAfter: oldestDueLagMs(now, oldestAfter),
    oldestDueLagMsBefore: oldestDueLagMs(now, oldestBefore),
    outcome: rows.length > 0 ? "claimed" : "empty_or_skipped_locked",
  };
}

export async function claimDueRankChecks(
  options: { now?: Date; pageSize?: number } = {},
  database: DispatchDatabase = prisma,
): Promise<ClaimDueRankChecksResult> {
  const now = options.now ?? new Date();
  if (!dispatcherClaimsAllowed()) {
    return {
      claimed: 0,
      claimedAt: now.toISOString(),
      groups: [],
      metrics: {
        distinctProjects: 0,
        largestProjectClaim: 0,
        oldestDueLagMsAfter: null,
        oldestDueLagMsBefore: null,
        outcome: "empty_or_skipped_locked",
      },
    };
  }
  const pageSize = boundedPageSize(options.pageSize);
  const perProjectCap = rankCheckDispatcherMaxKeywordsPerProject();

  return database.$transaction(async (tx) => {
    const oldestBefore = await oldestEligibleDueAt(tx, now);
    const selectedRows = await selectFairDueStates(tx, now, pageSize, perProjectCap);
    const advancedRows = selectedRows.map((row) => ({
      ...row,
      advancedCheckAt: computeDispatcherNextCheckAt(scheduleFromRow(row), row.keywordId, now),
    }));
    const stateVersions = await advanceClaimedStates(tx, advancedRows);
    const claimedRows = advancedRows.map((row) => {
      const stateVersion = stateVersions.get(row.keywordId);
      if (!stateVersion) throw new Error("Dispatcher advancement did not return a row version.");
      return { ...row, stateVersion };
    });
    const oldestAfter = await oldestEligibleDueAt(tx, now);
    return {
      claimed: claimedRows.length,
      claimedAt: now.toISOString(),
      groups: groupRows(claimedRows),
      metrics: claimMetrics(claimedRows, now, oldestBefore, oldestAfter),
    };
  });
}
