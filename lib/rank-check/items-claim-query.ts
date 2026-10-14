import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ClaimCandidate } from "./items-claim-types";
import { activeMarketExistsSql } from "./runnable";

type Candidate = ClaimCandidate;

export async function selectCandidates(
  tx: Prisma.TransactionClient,
  now: Date,
  limit: number,
  perProjectCap: number,
) {
  return tx.$queryRaw<Candidate[]>(Prisma.sql`
    WITH eligible_items AS MATERIALIZED (
      SELECT
        item.id,
        item.status,
        item."claimAttempts",
        item."claimExpiresAt",
        item."notBefore",
        item."keywordId",
        item."runId",
        run."publicId" AS "runPublicId",
        run."projectId",
        run."requestedCount",
        keyword."publicId" AS "keywordPublicId",
        keyword."locationId",
        keyword."archivedAt",
        ${activeMarketExistsSql("keyword")} AS "marketActive",
        keyword.device::text AS device,
        project.domain,
        COALESCE(item."notBefore", item."claimExpiresAt") AS "dueAt",
        ROW_NUMBER() OVER (
          PARTITION BY run."projectId"
          ORDER BY COALESCE(item."notBefore", item."claimExpiresAt"), item.id
        ) AS "projectRank",
        ROW_NUMBER() OVER (
          PARTITION BY item."keywordId"
          ORDER BY COALESCE(item."notBefore", item."claimExpiresAt"), item.id
        ) AS "keywordRank"
      FROM "rank_check_run_items" item
      JOIN "rank_check_runs" run ON run.id = item."runId"
      JOIN "keywords" keyword ON keyword.id = item."keywordId"
      JOIN "projects" project ON project.id = run."projectId"
      WHERE run.status IN ('queued', 'running')
        AND (
          (item.status = 'queued' AND item."notBefore" IS NOT NULL AND item."notBefore" <= ${now})
          OR (
            item.status = 'running'
            AND item."rankCheckId" IS NULL
            AND item."claimExpiresAt" < ${now}
          )
        )
        -- One running item per keyword is a unique index; a second run's target waits its turn
        -- instead of failing the whole claim.
        AND NOT EXISTS (
          SELECT 1
          FROM "rank_check_run_items" other
          WHERE other."keywordId" = item."keywordId"
            AND other.status = 'running'
            AND other.id <> item.id
        )
    ),
    fair_candidates AS MATERIALIZED (
      SELECT id
      FROM eligible_items
      WHERE "projectRank" <= ${perProjectCap} AND "keywordRank" = 1
      ORDER BY "projectRank", "dueAt", "projectId", id
      LIMIT ${limit}
    )
    SELECT eligible.*
    FROM fair_candidates candidate
    JOIN "rank_check_run_items" item ON item.id = candidate.id
    JOIN eligible_items eligible ON eligible.id = item.id
    JOIN "keywords" keyword ON keyword.id = item."keywordId"
    JOIN "rank_check_runs" run ON run.id = item."runId"
    WHERE run.status IN ('queued', 'running') AND (
      (item.status = 'queued' AND item."notBefore" IS NOT NULL AND item."notBefore" <= ${now})
      OR (
        item.status = 'running'
        AND item."rankCheckId" IS NULL
        AND item."claimExpiresAt" < ${now}
      )
    )
    ORDER BY eligible."projectRank", eligible."dueAt", eligible."projectId", eligible.id
    FOR UPDATE OF run, item, keyword SKIP LOCKED
  `);
}
