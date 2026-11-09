import "server-only";
import type { Prisma, SiteAuditRun } from "@/lib/generated/prisma/client";
import { auditPageEvidence } from "./page-evidence";
import type { CrawlStopReason } from "./run-contract";
import { auditRunSummary } from "./summary";

export async function saveSiteAuditSummary(tx: Prisma.TransactionClient, run: SiteAuditRun) {
  // Resolve sampled broken links against every persisted page, including later batches.
  await tx.$executeRaw`
    WITH failed AS MATERIALIZED (
      SELECT facts->>'url' AS url FROM site_audit_pages
      WHERE "runId" = ${run.id} AND (facts->>'status')::integer >= 400
        AND (facts->>'status')::integer <> 429
    ), broken AS (
      SELECT p.id, COUNT(*)::integer AS count
      FROM site_audit_pages p
      CROSS JOIN LATERAL jsonb_array_elements_text(p.facts->'internalLinks') AS link(url)
      JOIN failed f ON f.url = link.url
      WHERE p."runId" = ${run.id} GROUP BY p.id
    )
    UPDATE site_audit_pages p SET facts = jsonb_set(p.facts, '{issues}',
      (SELECT COALESCE(jsonb_agg(issue), '[]'::jsonb) FROM (
        SELECT issue FROM jsonb_array_elements(p.facts->'issues') AS issue
        WHERE issue->>'code' <> 'broken_internal_link' LIMIT 19
      ) existing) || jsonb_build_array(jsonb_build_object(
        'code', 'broken_internal_link', 'severity', 'warning',
        'message', broken.count || ' sampled internal links returned HTTP errors.')))
    FROM broken WHERE p.id = broken.id`;
  const evidence = await auditPageEvidence(tx, run.id);
  const now = run.completedAt ?? new Date();
  const body = auditRunSummary({
    target: run.target,
    startedAt: run.startedAt ?? run.createdAt,
    completedAt: now,
    budgetPages: run.budgetPages,
    requests: run.requests,
    stopReason: (run.stopReason ?? "time_limit") as CrawlStopReason,
    ...evidence,
  });
  await tx.agentReport.update({
    where: { id: run.reportId },
    data: {
      body: body as unknown as Prisma.InputJsonValue,
      cacheReuseUntil: run.stopReason === "finished" ? new Date(now.getTime() + 300_000) : now,
    },
  });
}
