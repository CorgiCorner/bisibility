import "server-only";
import { prisma } from "@/lib/db/prisma";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { loadRankTrackerReportCandidates } from "@/lib/queries/rank-tracker-report-database";
import { loadRankTrackerMetadataBatches } from "@/lib/queries/rank-tracker-metadata-batches";
import { consumerReportOptions } from "@/lib/queries/consumer-report-options";
import { loadRetainedRankReportTargets } from "@/lib/rank-reports/database";
import type { ReportSummary } from "@/lib/rank-reports/model";
import { isRestoredCheck } from "@/lib/rank-check/restored-check";
import {
  collectDigestAttention,
  incidentLinkedDigestChecks,
  type DigestAttention,
} from "./weekly-digest-attention";
import { weeklyDigestPeriod } from "./weekly-digest-period";
import { weeklyDigestQuality } from "./weekly-digest-quality";
export type WeeklyDigestData = {
  attention?: DigestAttention[];
  incidentOnly?: boolean;
  projectName: string;
  projectDomain: string;
  rangeStart: Date;
  rangeEnd: Date;
  topMovers: Array<{
    keyword: string;
    publicId: string;
    from: number | null;
    to: number | null;
    delta: number;
  }>;
  avgPositionDelta: number | null;
  failedChecksCount: number;
  checkedKeywords: number;
  quality: ReportSummary;
  membership: {
    archived: "excluded";
    pausedMarkets: "excluded";
    pausedSchedules: "include_retained";
  };
};

/** Trusted scheduled internal read. It has no User actor and never changes settings or calls providers. */
export function collectWeeklyDigestData(
  projectId: string,
  now: Date,
  incidentDigest = false,
): Promise<WeeklyDigestData | null> {
  const { periodStart: rangeStart, periodEnd: rangeEnd } = weeklyDigestPeriod(now);
  return prisma.$transaction(
    async (tx) => {
      const project = await tx.project.findFirst({
        select: { domain: true, id: true, publicId: true, name: true },
        where: { OR: [{ id: projectId }, { publicId: projectId }], writeMode: { not: "migrated" } },
      });
      if (!project) return null;
      const report = consumerReportOptions(
        new Date(now.getTime() - 1),
        async (current, selected) => {
          // Renew the scheduled service's exact project binding; never accept a caller-supplied actor/role.
          if (
            selected.id !== project.id ||
            selected.publicId !== project.publicId ||
            !(await current.project.findFirst({
              where: { id: project.id, publicId: project.publicId },
              select: { id: true },
            }))
          ) {
            throw new Error("Digest project is unavailable.");
          }
        },
      );
      const candidates = await loadRankTrackerReportCandidates(
        tx,
        project.id,
        report.limits,
        "include_retained",
      );
      const targets = candidates.rows.map(({ id, publicId, createdAt }) => ({
        id,
        publicId,
        createdAt,
      }));

      const metadata = await loadRankTrackerMetadataBatches(
        report.loadMetadata,
        tx,
        project,
        targets,
        report.asOf,
      );
      // Email window is half-open; an observation exactly at the next window is not this week.
      const policy = { ...report.policyAt(report.asOf), currentNotBefore: rangeStart };
      const loaded = await loadRetainedRankReportTargets(
        tx,
        { project, keywords: targets },
        policy,
        report.limits,
        metadata,
        false,
        undefined,
        { excludeRestored: true },
      );
      const retained = loaded.map((target) => ({
        ...target,
        checks: target.checks.filter((check) => !isRestoredCheck(check)),
      }));
      const activity = retained
        .flatMap((target) => target.checks)
        .filter((check) => check.checkedAt >= rangeStart && check.checkedAt < rangeEnd);
      const attention = incidentDigest
        ? await collectDigestAttention(tx, project, rangeStart, rangeEnd)
        : [];
      const linked = incidentDigest
        ? await incidentLinkedDigestChecks(
            tx,
            activity.filter((check) => check.status === "failed").map((check) => check.id),
          )
        : new Set<string>();
      const failedChecksCount = activity.filter(
        (check) => check.status === "failed" && !linked.has(check.id),
      ).length;
      const hasActivity = activity.some(
        (check) => check.status === "completed" || check.status === "failed",
      );
      if (!hasActivity && !attention.length) return null;
      const result = weeklyDigestQuality(
        retained,
        policy,
        project.id,
        new Map(candidates.rows.map((row) => [row.publicId, row.text])),
      );
      return {
        ...(attention.length ? { attention } : {}),
        ...(!hasActivity ? { incidentOnly: true } : {}),
        avgPositionDelta: result.avgPositionDelta,
        checkedKeywords: result.checkedKeywords,
        failedChecksCount,
        projectDomain: trackedProjectDomain(project.domain) ?? "",
        projectName: project.name,
        rangeEnd,
        rangeStart,
        topMovers: result.movers.slice(0, 5),
        quality: result.report,
        membership: {
          archived: "excluded",
          pausedMarkets: "excluded",
          pausedSchedules: "include_retained",
        },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
