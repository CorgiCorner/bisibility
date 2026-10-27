import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { normalizeResearchKeyword } from "@/lib/keyword-research/request-key";
import { trackedResearchForTargets } from "@/lib/keyword-research/tracked-research";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";

/** Only reads already-completed snapshots. It never starts a provider request. */
export async function loadTrackedResearch(
  tx: Prisma.TransactionClient,
  projectId: string,
  rows: readonly KeywordRow[],
  asOf: Date,
) {
  const targets = rows.map((row) => ({
    id: row.id,
    keyword: row.keyword,
    countryCode: row.location.gl,
    languageCode: row.location.hl,
  }));
  const names = [...new Set(targets.map((target) => normalizeResearchKeyword(target.keyword)))];
  if (names.length === 0) return new Map();
  const snapshots = await tx.$queryRaw<
    Array<{
      countryCode: string;
      languageCode: string;
      seed: string;
      fetchedAt: Date;
      row: unknown;
    }>
  >(Prisma.sql`
    SELECT s."countryCode", s."languageCode", s.seed, s."fetchedAt", item.value AS row
    FROM "keyword_research_snapshots" s
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.rows) = 'array' THEN s.rows ELSE '[]'::jsonb END) item(value)
    WHERE s."projectId" = ${projectId}
      AND s."fetchedAt" <= ${asOf}
      AND s."createdAt" <= ${asOf}
      AND s."updatedAt" <= ${asOf}
      AND lower(trim(regexp_replace(item.value->>'keyword', '[[:space:]]+', ' ', 'g'))) IN (${Prisma.join(names)})
    ORDER BY s."fetchedAt" DESC, s.id DESC
  `);
  return trackedResearchForTargets(
    targets,
    snapshots.map(({ row, ...snapshot }) => ({ ...snapshot, rows: [row] })),
  );
}
