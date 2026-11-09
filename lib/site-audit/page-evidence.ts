import "server-only";

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { SiteAuditPage } from "./schema";

export async function auditPageEvidence(
  db: PrismaClient | Prisma.TransactionClient,
  runId: string,
) {
  const [rows, totals] = await Promise.all([
    db.siteAuditPage.findMany({
      where: { runId },
      orderBy: { ordinal: "asc" },
      take: 15,
      select: { facts: true },
    }),
    db.$queryRaw<
      Array<{
        pages: number;
        errors: number;
        warnings: number;
        indexable: number;
        unavailable: number;
      }>
    >`
      SELECT COUNT(*)::integer AS pages,
        COUNT(*) FILTER (WHERE facts->>'indexable' = 'true')::integer AS indexable,
        COUNT(*) FILTER (WHERE (facts->>'status' IS NULL OR facts->>'status' = '429')
          AND NOT jsonb_path_exists(facts, '$.issues[*] ? (@.code == "robots_disallowed")'))::integer AS unavailable,
        COALESCE(SUM(jsonb_array_length(jsonb_path_query_array(facts, '$.issues[*] ? (@.severity == "error")'))), 0)::integer AS errors,
        COALESCE(SUM(jsonb_array_length(jsonb_path_query_array(facts, '$.issues[*] ? (@.severity == "warning")'))), 0)::integer AS warnings
      FROM site_audit_pages WHERE "runId" = ${runId}`,
  ]);
  return { pages: rows.map((row) => row.facts as unknown as SiteAuditPage), totals: totals[0] };
}
