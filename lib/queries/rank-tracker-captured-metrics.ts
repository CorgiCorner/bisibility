import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { type Metrics, metricsFromChecks } from "./keyword-metrics";
import type { RankTrackerReportMetadata } from "./rank-tracker-report-model";

/** Numeric metrics are read from compatible captured checks in the same report snapshot. */
export async function loadCapturedRankTrackerMetrics(
  tx: Prisma.TransactionClient,
  projectId: string,
  targets: readonly { id: string; publicId: string }[],
  metadata: ReadonlyMap<string, RankTrackerReportMetadata>,
  asOf: Date,
): Promise<Map<string, Metrics>> {
  if (targets.length > 500) throw new Error("Captured metrics require a bounded authorized batch.");
  const input = targets.flatMap((target) => {
    const scope = metadata.get(target.publicId)?.expectedScope;
    return scope?.targetRevision && scope.policyRevision
      ? [{ ...target, targetRevision: scope.targetRevision, policyRevision: scope.policyRevision }]
      : [];
  });
  if (!input.length) return new Map<string, Metrics>();
  const rows = await tx.$queryRaw<Array<{ publicId: string; checks: unknown }>>(Prisma.sql`
    SELECT requested."publicId", checks."metricChecks" AS checks
    FROM jsonb_to_recordset(${JSON.stringify(input)}::jsonb)
      AS requested(id text,"publicId" text,"targetRevision" text,"policyRevision" text)
    JOIN keywords k ON k.id=requested.id AND k."publicId"=requested."publicId" AND k."projectId"=${projectId}
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(retained.value ORDER BY retained."checkedAt" DESC,retained.id DESC) AS "metricChecks"
      FROM (
        SELECT rc.id,rc."checkedAt",jsonb_build_object(
          'volume',rc.raw->'volume','searchVolume',rc.raw->'searchVolume','search_volume',rc.raw->'search_volume',
          'cpc',rc.raw->'cpc','difficulty',rc.raw->'difficulty','keywordDifficulty',rc.raw->'keywordDifficulty',
          'keyword_difficulty',rc.raw->'keyword_difficulty',
          'keyword_info',jsonb_build_object('search_volume',rc.raw#>'{keyword_info,search_volume}',
            'cpc',rc.raw#>'{keyword_info,cpc}','keyword_difficulty',rc.raw#>'{keyword_info,keyword_difficulty}'),
          'keywordInfo',jsonb_build_object('searchVolume',rc.raw#>'{keywordInfo,searchVolume}',
            'cpc',rc.raw#>'{keywordInfo,cpc}','keywordDifficulty',rc.raw#>'{keywordInfo,keywordDifficulty}'),
          'metrics',jsonb_build_object('volume',rc.raw#>'{metrics,volume}','searchVolume',rc.raw#>'{metrics,searchVolume}',
            'cpc',rc.raw#>'{metrics,cpc}','difficulty',rc.raw#>'{metrics,difficulty}')) AS value
        FROM rank_checks rc JOIN observation_runs o ON o."rankCheckId"=rc.id
        WHERE rc."keywordId"=k.id AND rc.status='completed' AND rc."createdAt"<=${asOf}
          AND rc."updatedAt"<=${asOf} AND o."projectId"=${projectId} AND o."createdAt"<=${asOf}
          AND o."definitionBindingId" IS NOT NULL
          AND o."requestPolicy"#>>'{evidence,targetRevision}'=requested."targetRevision"
          AND o."requestPolicy"#>>'{evidence,policyRevision}'=requested."policyRevision"
        ORDER BY rc."checkedAt" DESC,rc.id DESC LIMIT 12
      ) retained
    ) checks ON true
  `);
  return new Map(
    rows.map((row) => {
      const metrics = metricsFromChecks(
        (Array.isArray(row.checks) ? row.checks : []).map((raw) => ({ raw })),
      );
      return [
        row.publicId,
        {
          ...metrics,
          volume: metrics.volume !== null && metrics.volume >= 0 ? metrics.volume : null,
          cpc: metrics.cpc !== null && metrics.cpc >= 0 ? metrics.cpc : null,
          // Feature presence is supplied separately from the selected observation, never a union of raw history.
          serpFeatures: [],
        },
      ] as const;
    }),
  );
}
