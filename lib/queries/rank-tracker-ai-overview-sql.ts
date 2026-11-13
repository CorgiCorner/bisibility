import { Prisma } from "@/lib/generated/prisma/client";

/** Latest completed check id for a keyword, optionally fenced at a snapshot. */
export function latestCompletedCheckSql(keywordId: Prisma.Sql, asOf: Date | null) {
  return Prisma.sql`(
    SELECT rc2.id FROM "rank_checks" rc2
    WHERE rc2."keywordId" = ${keywordId}
      AND rc2.status = 'completed'
      ${asOf ? Prisma.sql`AND rc2."checkedAt" <= ${asOf}` : Prisma.empty}
    ORDER BY rc2."checkedAt" DESC, rc2.id DESC
    LIMIT 1
  )`;
}

/** Presence only. The fragment column is intentionally absent. */
export function aiOverviewShownExistsSql(keywordId: Prisma.Sql, asOf: Date | null) {
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "observation_runs" run
    JOIN "observation_items" item
      ON item."observationRunId" = run.id
      AND item."resultKind" = 'ai_overview'
    WHERE run."rankCheckId" = ${latestCompletedCheckSql(keywordId, asOf)}
  )`;
}

export function aiOverviewShownIdsSql(projectId: string, publicIds: readonly string[], asOf: Date) {
  return Prisma.sql`
    SELECT k."publicId" AS "keywordId"
    FROM "keywords" k
    WHERE k."projectId" = ${projectId}
      AND k."publicId" IN (${Prisma.join(publicIds)})
      AND ${aiOverviewShownExistsSql(Prisma.sql`k.id`, asOf)}
  `;
}

/** Raw fragments are selected only for the public ids of the current page. */
export function aiOverviewPageItemsSql(
  projectId: string,
  publicIds: readonly string[],
  asOf: Date,
) {
  return Prisma.sql`
    SELECT k."publicId" AS "keywordId",
      rc."checkedAt" AS "checkedAt",
      item.title AS title,
      item."rawFragment" AS "rawFragment"
    FROM "keywords" k
    JOIN LATERAL (
      SELECT rc2.id, rc2."checkedAt"
      FROM "rank_checks" rc2
      WHERE rc2."keywordId" = k.id
        AND rc2.status = 'completed'
        AND rc2."checkedAt" <= ${asOf}
      ORDER BY rc2."checkedAt" DESC, rc2.id DESC
      LIMIT 1
    ) rc ON true
    LEFT JOIN "observation_runs" run ON run."rankCheckId" = rc.id
    LEFT JOIN "observation_items" item
      ON item."observationRunId" = run.id
      AND item."resultKind" = 'ai_overview'
    WHERE k."projectId" = ${projectId}
      AND k."publicId" IN (${Prisma.join(publicIds)})
  `;
}
