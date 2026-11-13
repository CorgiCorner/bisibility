import "server-only";
import { prisma } from "@/lib/db/prisma";

export function liveShareFilter(now: Date) {
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    revokedAt: null,
  };
}

const reportSelect = {
  body: true,
  createdAt: true,
  id: true,
  kind: true,
  publicId: true,
  title: true,
} as const;

export function findActiveShare(projectId: string, reportPublicId: string, now: Date) {
  return prisma.agentReportShareLink.findFirst({
    include: {
      reports: {
        include: { report: { select: reportSelect } },
        orderBy: { addedAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
    where: {
      ...liveShareFilter(now),
      projectId,
      reports: { some: { report: { publicId: reportPublicId } } },
    },
  });
}

export function findChallengeReport(projectId: string, reportPublicId: string) {
  return prisma.agentReport.findFirst({
    select: reportSelect,
    where: { kind: "challenge_report", projectId, publicId: reportPublicId },
  });
}
