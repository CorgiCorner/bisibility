import "server-only";
import { type Actor, getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getSession } from "@/lib/auth/session";
import { challengeReportBodySchema } from "@/lib/challenge-report/schema";
import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { after } from "next/server";
import { shouldCountShareView } from "./access";
import { utcDay } from "./dates";
import { type PublicReport, publicReportView } from "./projection";
import { parseShareSettings } from "./settings";
import { hashShareToken, SHARE_TOKEN_PATTERN } from "./token";

export type ResolvedShare = {
  domain: string;
  linkId: string;
  projectId: string;
  reports: { id: string; stage: PublicReport["stage"] }[];
  title: string;
  view: PublicReport;
  writeMode: unknown;
};

export async function resolveShareToken(
  token: string,
  now = new Date(),
  stageId?: string,
): Promise<ResolvedShare | null> {
  if (!SHARE_TOKEN_PATTERN.test(token)) return null;
  const link = await prisma.agentReportShareLink.findUnique({
    include: {
      project: { select: { domain: true, id: true, writeMode: true } },
      reports: {
        include: {
          report: { select: { body: true, kind: true, publicId: true, title: true } },
        },
        orderBy: { addedAt: "desc" },
      },
    },
    where: { tokenHash: hashShareToken(token) },
  });
  if (
    !link ||
    link.revokedAt ||
    (link.expiresAt && link.expiresAt <= now) ||
    link.reports.length === 0
  ) {
    return null;
  }
  const parsed = link.reports.flatMap((row) => {
    if (row.report.kind !== "challenge_report") return [];
    const body = challengeReportBodySchema.safeParse(row.report.body);
    if (!body.success) return [];
    return [{ body: body.data, id: row.report.publicId, title: row.report.title }];
  });
  if (parsed.length === 0) return null;
  const selected = parsed.find((row) => row.id === stageId) ?? parsed[0];
  if (!selected) return null;
  const settings = parseShareSettings(link.settings);
  return {
    domain: link.project.domain?.trim() ?? "",
    linkId: link.id,
    projectId: link.project.id,
    reports: parsed.map((row) => ({ id: row.id, stage: row.body.stage })),
    title: selected.title,
    view: publicReportView(selected.body, settings),
    writeMode: link.project.writeMode,
  };
}

export async function viewerCanShare(projectId: string, writeMode: unknown): Promise<boolean> {
  if (isProjectReadOnly(writeMode) || readDemoConfig().kind === "legacy-read-only") return false;
  const session = await getSession();
  if (!session) return false;
  const user = await prisma.user.findUnique({
    select: { id: true, memberships: { select: { projectId: true, role: true } }, role: true },
    where: { id: session.user.id },
  });
  if (!user) return false;
  const actor: Actor = { id: user.id, memberships: user.memberships, role: user.role };
  return canProjectAction(getProjectRole(actor, projectId), "update", "project");
}

export function scheduleShareView(
  linkId: string,
  headers: { get(name: string): string | null },
  now = new Date(),
) {
  if (!shouldCountShareView(headers)) return;
  after(() => recordShareView(linkId, now));
}

export async function recordShareView(linkId: string, now: Date) {
  const day = utcDay(now);
  await prisma.$transaction([
    prisma.agentReportShareLink.update({
      data: { viewCount: { increment: 1 } },
      where: { id: linkId },
    }),
    prisma.agentReportShareLinkDay.upsert({
      create: { day, shareLinkId: linkId, views: 1 },
      update: { views: { increment: 1 } },
      where: { shareLinkId_day: { day, shareLinkId: linkId } },
    }),
  ]);
}
