import "server-only";
import { prisma } from "@/lib/db/prisma";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { loadRankTrackerReportCandidates } from "@/lib/queries/rank-tracker-report-database";
import { loadRankTrackerMetadataBatches } from "@/lib/queries/rank-tracker-metadata-batches";
import { consumerReportOptions } from "@/lib/queries/consumer-report-options";
import { loadRetainedRankReportTargets } from "@/lib/rank-reports/database";
import type { ReportSummary } from "@/lib/rank-reports/model";
import { weeklyDigestQuality } from "./weekly-digest-quality";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export type WeeklyDigestData = {
  projectName: string; projectDomain: string; rangeStart: Date; rangeEnd: Date;
  topMovers: Array<{ keyword: string; publicId: string; from: number | null; to: number | null; delta: number }>;
  avgPositionDelta: number | null; failedChecksCount: number; checkedKeywords: number;
  quality: ReportSummary;
  membership: { archived: "excluded"; pausedMarkets: "excluded"; pausedSchedules: "include_retained" };
};

/** Trusted scheduled internal read. It has no User actor and never changes settings or calls providers. */
export function collectWeeklyDigestData(projectId: string, now: Date): Promise<WeeklyDigestData | null> {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid digest time.");
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({ select: { domain: true, id: true, publicId: true, name: true },
      where: { OR: [{ id: projectId }, { publicId: projectId }] } });
    if (!project) return null;
    const report = consumerReportOptions(new Date(now.getTime() - 1), async (current, selected) => {
      // Renew the scheduled service's exact project binding; never accept a caller-supplied actor/role.
      if (selected.id !== project.id || selected.publicId !== project.publicId ||
        !await current.project.findFirst({ where: { id: project.id, publicId: project.publicId }, select: { id: true } })) {
        throw new Error("Digest project is unavailable.");
      }
    });
    const candidates = await loadRankTrackerReportCandidates(tx, project.id, report.limits, "include_retained");
    const targets = candidates.rows.map(({ id, publicId, createdAt }) => ({ id, publicId, createdAt }));
    const rangeEnd = new Date(now), rangeStart = new Date(now.getTime() - WEEK_MS);
    const metadata = await loadRankTrackerMetadataBatches(report.loadMetadata, tx, project, targets, report.asOf);
    // Email window is half-open; an observation exactly at the next window is not this week.
    const policy = { ...report.policyAt(report.asOf), currentNotBefore: rangeStart };
    const retained = await loadRetainedRankReportTargets(tx, { project, keywords: targets }, policy, report.limits, metadata, false);
    const activity = retained.flatMap((target) => target.checks).filter((check) => check.checkedAt >= rangeStart && check.checkedAt < rangeEnd);
    const failedChecksCount = activity.filter((check) => check.status === "failed").length;
    if (!activity.some((check) => check.status === "completed") && !failedChecksCount) return null;
    const result = weeklyDigestQuality(retained, policy, project.id, new Map(candidates.rows.map((row) => [row.publicId, row.text])));
    return { avgPositionDelta: result.avgPositionDelta, checkedKeywords: result.checkedKeywords,
      failedChecksCount, projectDomain: trackedProjectDomain(project.domain) ?? "", projectName: project.name,
      rangeEnd, rangeStart, topMovers: result.movers.slice(0, 5), quality: result.report,
      membership: { archived: "excluded", pausedMarkets: "excluded", pausedSchedules: "include_retained" } };
  }, { isolationLevel: "RepeatableRead" });
}
