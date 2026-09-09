import { Prisma } from "@/lib/generated/prisma/client";

/** Registered markets remain valid scopes before their first keyword is added. */
export function rankTrackerLocationsSql(
  projectId: string,
  source: "project_keywords" | "project_keyword_inputs",
) {
  const keywords = Prisma.raw(source);
  return Prisma.sql`
    SELECT "canonicalKey", "displayName", "locationKind", COUNT(*)::int count
    FROM ${keywords} GROUP BY 1,2,3
    UNION ALL
    SELECT l."canonicalKey", l."displayName", l.kind::text AS "locationKind", 0 AS count
    FROM "project_markets" pm JOIN "locations" l ON l.id = pm."locationId"
    WHERE pm."projectId" = ${projectId} AND pm.status::text IN ('active', 'paused')
      AND NOT EXISTS (SELECT 1 FROM ${keywords} k WHERE k."canonicalKey" = l."canonicalKey")`;
}
