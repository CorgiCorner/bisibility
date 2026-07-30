import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { dispatcherEligibleFilter } from "./dispatcher-state-sql";

export type DispatcherStateCountRow = {
  eligible: bigint;
  eligibleWithState: bigint;
  gone: bigint;
  ineligible: bigint;
  maxNextCheckAt: Date | null;
  minNextCheckAt: Date | null;
  missing: bigint;
};

type CountDatabase = Pick<typeof prisma, "$queryRaw">;

export async function readDispatcherStateCounts(database: CountDatabase = prisma) {
  const [row] = await database.$queryRaw<DispatcherStateCountRow[]>(Prisma.sql`
    WITH eligible AS (
      SELECT k.id
      FROM "keywords" k
      JOIN "projects" p ON p.id = k."projectId"
      JOIN "users" owner ON owner.id = p."ownerId"
      LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k.id
      LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
      WHERE ${dispatcherEligibleFilter}
    )
    SELECT
      (SELECT COUNT(*) FROM eligible) AS eligible,
      (SELECT COUNT(*) FROM eligible e JOIN "keyword_dispatch_states" s
        ON s."keywordId" = e.id) AS "eligibleWithState",
      (SELECT COUNT(*) FROM eligible e LEFT JOIN "keyword_dispatch_states" s
        ON s."keywordId" = e.id WHERE s."keywordId" IS NULL) AS missing,
      (SELECT COUNT(*) FROM "keyword_dispatch_states" s LEFT JOIN "keywords" k
        ON k.id = s."keywordId" WHERE k.id IS NULL) AS gone,
      (SELECT COUNT(*) FROM "keyword_dispatch_states" s JOIN "keywords" k
        ON k.id = s."keywordId"
        WHERE NOT EXISTS (SELECT 1 FROM eligible e WHERE e.id = s."keywordId")) AS ineligible,
      (SELECT MIN(s."nextCheckAt") FROM eligible e JOIN "keyword_dispatch_states" s
        ON s."keywordId" = e.id) AS "minNextCheckAt",
      (SELECT MAX(s."nextCheckAt") FROM eligible e JOIN "keyword_dispatch_states" s
        ON s."keywordId" = e.id) AS "maxNextCheckAt"
  `);
  if (!row) throw new Error("Dispatcher coverage query returned no row.");
  return row;
}

export function dispatcherStateCountsEqual(
  first: DispatcherStateCountRow,
  second: DispatcherStateCountRow,
) {
  return (
    first.eligible === second.eligible &&
    first.eligibleWithState === second.eligibleWithState &&
    first.missing === second.missing &&
    first.gone === second.gone &&
    first.ineligible === second.ineligible &&
    first.minNextCheckAt?.getTime() === second.minNextCheckAt?.getTime() &&
    first.maxNextCheckAt?.getTime() === second.maxNextCheckAt?.getTime()
  );
}
