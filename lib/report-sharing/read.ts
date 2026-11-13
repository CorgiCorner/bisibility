import "server-only";
import { challengeReportBodySchema } from "@/lib/challenge-report/schema";
import { prisma } from "@/lib/db/prisma";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { viewsWindowStart } from "./dates";
import type { ReportShareAudience, ReportShareSummary } from "./model";
import { defaultShareSettings, expiryChoice, parseShareSettings } from "./settings";
import { pickPendingUpdate, reportSeriesKey, stageRank } from "./stage";
import { findActiveShare, findChallengeReport, liveShareFilter } from "./store";

export async function reportAudiences(
  projectId: string,
  reportIds: readonly string[],
  now = new Date(),
): Promise<Map<string, ReportShareAudience>> {
  const map = new Map<string, ReportShareAudience>(reportIds.map((id) => [id, "members"]));
  if (reportIds.length === 0) return map;
  const rows = await prisma.agentReportShareLinkReport.findMany({
    select: { report: { select: { publicId: true } } },
    where: {
      report: { projectId, publicId: { in: [...reportIds] } },
      shareLink: { ...liveShareFilter(now), projectId },
    },
  });
  for (const row of rows) map.set(row.report.publicId, "link");
  return map;
}

export async function readReportShareSummary(input: {
  actorId: string;
  now?: Date;
  projectId: string;
  projectPublicId: string;
  reportId: string;
}): Promise<ReportShareSummary | null> {
  const report = await findChallengeReport(input.projectId, input.reportId);
  if (!report) return null;
  const now = input.now ?? new Date();
  const [project, link] = await Promise.all([
    prisma.project.findUnique({
      select: {
        _count: { select: { members: true } },
        owner: { select: { id: true, name: true } },
        publicId: true,
      },
      where: { id: input.projectId },
    }),
    findActiveShare(input.projectId, input.reportId, now),
  ]);
  if (!project) return null;
  const settings = link ? parseShareSettings(link.settings) : defaultShareSettings();
  const views7d = link ? await recentViews(link.id, now) : 0;
  const newest = link?.reports[0]?.report;
  const newestBody = newest ? challengeReportBodySchema.safeParse(newest.body) : null;
  const pending =
    link && newestBody?.success
      ? await pendingFor(
          input.projectId,
          reportSeriesKey(newestBody.data),
          stageRank(newestBody.data.stage, newestBody.data.period.days),
          now,
        )
      : null;
  return {
    access: link ? "link" : "members",
    expires: link ? expiryChoice(link.createdAt, link.expiresAt) : "never",
    memberCount: project._count.members,
    ownerIsViewer: project.owner.id === input.actorId,
    ownerName: project.owner.name?.trim() ?? "",
    pending,
    reportId: report.publicId,
    settings,
    teamHref: appPath(asProjectRef(project.publicId), "settings", "team"),
    views7d,
  };
}

async function recentViews(shareLinkId: string, now: Date) {
  const sum = await prisma.agentReportShareLinkDay.aggregate({
    _sum: { views: true },
    where: { day: { gte: viewsWindowStart(now) }, shareLinkId },
  });
  return sum._sum.views ?? 0;
}

async function pendingFor(projectId: string, from: string, rank: number, now: Date) {
  const [reports, active] = await Promise.all([
    prisma.agentReport.findMany({
      select: { body: true, createdAt: true, id: true, publicId: true, title: true },
      where: { kind: "challenge_report", projectId },
    }),
    prisma.agentReportShareLinkReport.findMany({
      select: { reportId: true },
      where: { shareLink: { projectId, ...liveShareFilter(now) } },
    }),
  ]);
  const activeIds = new Set(active.map((row) => row.reportId));
  const picked = pickPendingUpdate(
    { from, rank },
    reports.flatMap((report) => {
      const body = challengeReportBodySchema.safeParse(report.body);
      if (!body.success) return [];
      return [
        {
          createdAt: report.createdAt.toISOString(),
          from: reportSeriesKey(body.data),
          id: report.publicId,
          onActiveLink: activeIds.has(report.id),
          rank: stageRank(body.data.stage, body.data.period.days),
          stage: body.data.stage,
          title: report.title,
        },
      ];
    }),
  );
  return picked ? { reportId: picked.id, stage: picked.stage, title: picked.title } : null;
}
