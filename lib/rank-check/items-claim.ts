import { selectCandidates } from "./items-claim-query";
import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { publishOperationChanged } from "@/lib/notifications/realtime";
import { rankCheckDispatcherMaxKeywordsPerProject } from "./dispatcher-config";
import {
  RANK_CHECK_ITEM_CLAIM_LEASE_MS,
  RANK_CHECK_ITEM_CLAIM_MAX_ATTEMPTS,
} from "./dispatcher-constants";
import type { ClaimDueRankChecksResult, ClaimedRankCheckGroup } from "./dispatcher-types";
import { cancelUnrunnableCandidates } from "./items-claim-cancel";
import { itemClaimMetrics } from "./items-claim-metrics";
import { type ClaimCandidate, claimCandidateRun } from "./items-claim-types";
import { finalizeRankCheckRun } from "./runs/finalize";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
type Candidate = ClaimCandidate;

type ClaimedRow = { claimAttempts: number; id: string; status: string };

type ClaimDatabase = {
  $transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

export async function markRankCheckRunStarted(
  tx: Prisma.TransactionClient,
  input: { now: Date; runId: string },
) {
  await tx.rankCheckRun.updateMany({
    data: { startedAt: input.now, status: "running" },
    where: { id: input.runId, status: "queued" },
  });
}

function pageSize(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value ?? DEFAULT_PAGE_SIZE)));
}

async function claimQueued(
  tx: Prisma.TransactionClient,
  ids: string[],
  now: Date,
  claimExpiresAt: Date,
) {
  if (ids.length === 0) return [];
  return tx.$queryRaw<ClaimedRow[]>(Prisma.sql`
    UPDATE "rank_check_run_items"
    SET
      status = 'running',
      "startedAt" = ${now},
      "claimExpiresAt" = ${claimExpiresAt},
      "claimAttempts" = "claimAttempts" + 1,
      "updatedAt" = ${now}
    WHERE id = ANY(${ids}::text[]) AND status = 'queued'
    RETURNING id, status, "claimAttempts"
  `);
}

async function reclaimExpired(
  tx: Prisma.TransactionClient,
  ids: string[],
  now: Date,
  claimExpiresAt: Date,
) {
  if (ids.length === 0) return [];
  return tx.$queryRaw<ClaimedRow[]>(Prisma.sql`
    UPDATE "rank_check_run_items"
    SET
      status = CASE
        WHEN "claimAttempts" + 1 > ${RANK_CHECK_ITEM_CLAIM_MAX_ATTEMPTS}
          THEN 'blocked'
        ELSE 'running'
      END,
      "blockedReason" = CASE
        WHEN "claimAttempts" + 1 > ${RANK_CHECK_ITEM_CLAIM_MAX_ATTEMPTS}
          THEN 'claim_lost'
        ELSE NULL
      END,
      "claimExpiresAt" = CASE
        WHEN "claimAttempts" + 1 > ${RANK_CHECK_ITEM_CLAIM_MAX_ATTEMPTS}
          THEN NULL
        ELSE ${claimExpiresAt}::timestamp(3)
      END,
      "claimAttempts" = "claimAttempts" + 1,
      "finishedAt" = CASE
        WHEN "claimAttempts" + 1 > ${RANK_CHECK_ITEM_CLAIM_MAX_ATTEMPTS}
          THEN ${now}::timestamp(3)
        ELSE NULL
      END,
      "updatedAt" = ${now}
    WHERE id = ANY(${ids}::text[])
      AND status = 'running'
      AND "rankCheckId" IS NULL
      AND "claimExpiresAt" < ${now}
    RETURNING id, status, "claimAttempts"
  `);
}

function groupClaims(
  candidates: Candidate[],
  claimedIds: Set<string>,
  claimedRows: ReadonlyMap<string, ClaimedRow>,
  claimExpiresAt: Date,
) {
  const groups = new Map<string, ClaimedRankCheckGroup>();
  for (const item of candidates) {
    if (!claimedIds.has(item.id)) continue;
    const key = JSON.stringify([item.runId, item.locationId, item.device]);
    const group = groups.get(key) ?? {
      claims: [],
      device: item.device,
      domain: item.domain,
      keywordIds: [],
      locationId: item.locationId,
      projectId: item.projectId,
      runId: item.runId,
      runItemIds: [],
      runItemClaims: [],
    };
    group.keywordIds.push(item.keywordId);
    group.runItemIds?.push(item.id);
    const claimed = claimedRows.get(item.id);
    if (!claimed) throw new Error("Original run-item claim is unavailable.");
    group.runItemClaims?.push({
      id: item.id,
      claimAttempts: claimed.claimAttempts,
      claimExpiresAt: claimExpiresAt.toISOString(),
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}

export async function claimDueRankCheckItems(
  options: { now?: Date; pageSize?: number } = {},
  database: ClaimDatabase = prisma,
): Promise<ClaimDueRankChecksResult> {
  const now = options.now ?? new Date();
  const claimExpiresAt = new Date(now.getTime() + RANK_CHECK_ITEM_CLAIM_LEASE_MS);
  const limit = pageSize(options.pageSize);
  const perProjectCap = rankCheckDispatcherMaxKeywordsPerProject();
  const outcome = await database.$transaction(async (tx) => {
    const selected = await selectCandidates(tx, now, limit, perProjectCap);
    const { cancelledProjectIds, runnable: candidates } = await cancelUnrunnableCandidates(
      tx,
      selected,
      now,
    );
    const blockedProjectIds = new Set<string>(cancelledProjectIds);
    const queued = await claimQueued(
      tx,
      candidates.filter((item) => item.status === "queued").map((item) => item.id),
      now,
      claimExpiresAt,
    );
    const reclaimed = await reclaimExpired(
      tx,
      candidates.filter((item) => item.status === "running").map((item) => item.id),
      now,
      claimExpiresAt,
    );
    const byId = new Map(candidates.map((item) => [item.id, item]));
    for (const item of reclaimed) {
      const candidate = byId.get(item.id);
      if (!candidate) throw new Error("Reclaimed item was not selected by this transaction.");
      const claimLost = item.status === "blocked";
      if (claimLost) {
        blockedProjectIds.add(candidate.projectId);
        await tx.rankCheckRun.update({
          data: { skippedCount: { increment: 1 } },
          where: { id: candidate.runId },
        });
        await finalizeRankCheckRun(tx, { now, run: claimCandidateRun(candidate) });
      }
      await writeAudit(
        {
          action: "rank_check_run.item_reclaimed",
          actorId: null,
          after: {
            claimAttempts: item.claimAttempts,
            itemId: item.id,
            keywordId: requiredPublicAuditId(candidate.keywordPublicId, "kw", "Rank-check"),
            reason: claimLost ? "claim_lost" : "lease_expired",
          },
          projectId: candidate.projectId,
          targetId: requiredPublicAuditId(candidate.runPublicId, "rcr", "Rank-check run"),
          targetType: "rank_check_run",
        },
        tx,
      );
    }
    const activeIds = new Set(
      [...queued, ...reclaimed].filter((item) => item.status === "running").map((item) => item.id),
    );
    const groups = groupClaims(
      candidates,
      activeIds,
      new Map([...queued, ...reclaimed].map((item) => [item.id, item])),
      claimExpiresAt,
    );
    for (const runId of new Set(groups.map((group) => group.runId))) {
      if (!runId) continue;
      await markRankCheckRunStarted(tx, { now, runId });
    }
    return {
      blockedProjectIds: [
        ...new Set([...blockedProjectIds, ...groups.map((group) => group.projectId)]),
      ],
      result: {
        claimed: activeIds.size,
        claimedAt: now.toISOString(),
        groups,
        metrics: itemClaimMetrics(groups, activeIds.size, now, candidates),
      },
    };
  });
  for (const projectId of outcome.blockedProjectIds) {
    await publishOperationChanged({ projectId }).catch(() => undefined);
  }
  return outcome.result;
}
