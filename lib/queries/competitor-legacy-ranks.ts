import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { organicDomainRanksFromRaw } from "@/lib/rank-check/organic-ranks";

export async function legacyOrganicRanks(projectId: string, keywordIds: string[]) {
  if (keywordIds.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ keywordId: string; raw: unknown }>>(Prisma.sql`
    WITH latest AS (
      SELECT DISTINCT ON (rc."keywordId") rc."keywordId", rc."organicRanks", rc."raw"
      FROM "rank_checks" rc
      INNER JOIN "keywords" keyword ON keyword."id" = rc."keywordId"
      WHERE keyword."projectId" = ${projectId}
        AND rc."keywordId" IN (${Prisma.join(keywordIds)})
        AND rc."status" = 'completed'
      ORDER BY rc."keywordId" ASC, rc."checkedAt" DESC, rc."id" DESC
    )
    SELECT "keywordId", "raw" FROM latest WHERE "organicRanks" IS NULL
  `);
  return rows.flatMap((row) => {
    const ranks = organicDomainRanksFromRaw(row.raw);
    return ranks ? [{ keywordId: row.keywordId, ranks }] : [];
  });
}
