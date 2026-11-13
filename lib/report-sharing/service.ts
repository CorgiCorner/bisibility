import "server-only";
import { challengeReportBodySchema } from "@/lib/challenge-report/schema";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  defaultShareSettings,
  expiryDate,
  parseShareSettings,
  type ShareExpiryChoice,
  type ShareSettings,
} from "./settings";
import { pickPendingUpdate, reportSeriesKey, stageRank } from "./stage";
import { findActiveShare, findChallengeReport, liveShareFilter } from "./store";
import { createShareToken, hashShareToken } from "./token";

function settingsJson(settings: ShareSettings): Prisma.InputJsonValue {
  return settings;
}

export async function createReportShareLink(input: {
  actorId: string;
  now?: Date;
  expires?: ShareExpiryChoice;
  settings?: Partial<Omit<ShareSettings, "version">>;
  projectId: string;
  reportId: string;
}) {
  const report = await findChallengeReport(input.projectId, input.reportId);
  if (!report) return null;
  const token = createShareToken();
  const row = await prisma.agentReportShareLink.create({
    data: {
      createdById: input.actorId,
      projectId: input.projectId,
      publicId: makePublicId("rsl"),
      reports: { create: { reportId: report.id } },
      settings: settingsJson(parseShareSettings({ ...defaultShareSettings(), ...input.settings })),
      ...(input.expires ? { expiresAt: expiryDate(input.expires, input.now ?? new Date()) } : {}),
      tokenHash: hashShareToken(token),
    },
    select: { publicId: true },
  });
  return { publicId: row.publicId, token };
}

async function activeOrNull(projectId: string, reportId: string, now: Date) {
  return findActiveShare(projectId, reportId, now);
}

export async function updateReportShareSettings(input: {
  now?: Date;
  patch: Partial<Omit<ShareSettings, "version">>;
  projectId: string;
  reportId: string;
}) {
  const now = input.now ?? new Date();
  const link = await activeOrNull(input.projectId, input.reportId, now);
  if (!link) return null;
  const settings = parseShareSettings({
    ...parseShareSettings(link.settings),
    ...input.patch,
    version: 1,
  });
  await prisma.agentReportShareLink.update({
    data: { settings: settingsJson(settings) },
    where: { id: link.id },
  });
  return settings;
}

export async function updateReportShareExpiry(input: {
  choice: ShareExpiryChoice;
  now?: Date;
  projectId: string;
  reportId: string;
}) {
  const now = input.now ?? new Date();
  const link = await activeOrNull(input.projectId, input.reportId, now);
  if (!link) return null;
  await prisma.agentReportShareLink.update({
    data: { expiresAt: expiryDate(input.choice, now) },
    where: { id: link.id },
  });
  return input.choice;
}

export async function revokeReportShareLink(input: {
  now?: Date;
  projectId: string;
  reportId: string;
}) {
  const now = input.now ?? new Date();
  const link = await activeOrNull(input.projectId, input.reportId, now);
  if (!link) return null;
  await prisma.agentReportShareLink.update({
    data: { revokedAt: now },
    where: { id: link.id },
  });
  return link.publicId;
}

export async function reissueReportShareToken(input: {
  now?: Date;
  projectId: string;
  reportId: string;
}) {
  const now = input.now ?? new Date();
  const link = await activeOrNull(input.projectId, input.reportId, now);
  if (!link) return null;
  const token = createShareToken();
  await prisma.agentReportShareLink.update({
    data: { tokenHash: hashShareToken(token) },
    where: { id: link.id },
  });
  return token;
}

export async function publishReportShareUpdate(input: {
  actorId: string;
  mode: "link" | "new";
  now?: Date;
  projectId: string;
  reportId: string;
}) {
  const now = input.now ?? new Date();
  const link = await activeOrNull(input.projectId, input.reportId, now);
  const newest = link?.reports[0]?.report;
  const parsed = newest ? challengeReportBodySchema.safeParse(newest.body) : null;
  if (!link || !newest || !parsed?.success) return null;
  const pending = await pendingCandidate(
    input.projectId,
    reportSeriesKey(parsed.data),
    stageRank(parsed.data.stage, parsed.data.period.days),
    now,
  );
  if (!pending) return null;
  if (input.mode === "link") {
    await prisma.agentReportShareLinkReport.create({
      data: { reportId: pending.internalId, shareLinkId: link.id },
    });
    return { token: null };
  }
  return createReportShareLink({
    actorId: input.actorId,
    now,
    projectId: input.projectId,
    reportId: pending.id,
  });
}

async function pendingCandidate(projectId: string, from: string, rank: number, now: Date) {
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
  const candidates = reports.flatMap((report) => {
    const body = challengeReportBodySchema.safeParse(report.body);
    if (!body.success) return [];
    return [
      {
        createdAt: report.createdAt.toISOString(),
        from: reportSeriesKey(body.data),
        id: report.publicId,
        internalId: report.id,
        onActiveLink: activeIds.has(report.id),
        rank: stageRank(body.data.stage, body.data.period.days),
        stage: body.data.stage,
        title: report.title,
      },
    ];
  });
  const picked = pickPendingUpdate({ from, rank }, candidates);
  return picked ? (candidates.find((item) => item.id === picked.id) ?? null) : null;
}
