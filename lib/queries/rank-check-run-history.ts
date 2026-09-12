import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  type RankCheckRunActor,
  rankCheckRunActorDto,
  rankCheckRunSelect,
} from "./rank-check-run-dto";

export function wasSkippedBeforeLaunch(row: {
  finishedAt: Date | null;
  launchedAt: Date | null;
  status: string;
}) {
  return row.status === "cancelled" && row.launchedAt === null && row.finishedAt !== null;
}

export async function skippedByRunPublicId(
  rows: readonly {
    finishedAt: Date | null;
    launchedAt: Date | null;
    publicId: string;
    status: string;
  }[],
) {
  const publicIds = rows.filter(wasSkippedBeforeLaunch).map((row) => row.publicId);
  if (publicIds.length === 0) return new Map<string, RankCheckRunActor | null>();
  const audits = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      actor: { select: { email: true, image: true, name: true } },
      targetId: true,
    },
    where: {
      action: "rank_check_run.skip",
      status: "success",
      targetId: { in: publicIds },
      targetType: "rank_check_run",
    },
  });
  const actors = new Map<string, RankCheckRunActor | null>();
  for (const audit of audits) {
    if (!actors.has(audit.targetId)) actors.set(audit.targetId, rankCheckRunActorDto(audit.actor));
  }
  return actors;
}

export async function findHistoryRunRows(
  projectId: string,
  statuses: readonly string[] | undefined,
  cursor: { id: string; timestamp: Date } | null,
  take: number,
) {
  const instant = Prisma.sql`COALESCE("launchedAt", "finishedAt")`;
  const statusFilter = statuses?.length
    ? Prisma.sql`AND "status" IN (${Prisma.join(statuses)})`
    : Prisma.empty;
  const cursorFilter = cursor
    ? Prisma.sql`AND (${instant} < ${cursor.timestamp} OR (${instant} = ${cursor.timestamp} AND "publicId" < ${cursor.id}))`
    : Prisma.empty;
  const ids = await prisma.$queryRaw<Array<{ publicId: string }>>(Prisma.sql`
    SELECT "publicId"
    FROM "rank_check_runs"
    WHERE "projectId" = ${projectId}
      AND "deletedAt" IS NULL
      AND ("launchedAt" IS NOT NULL OR ("status" = 'cancelled' AND "finishedAt" IS NOT NULL))
      ${statusFilter}
      ${cursorFilter}
    ORDER BY ${instant} DESC, "publicId" DESC
    LIMIT ${take}
  `);
  if (ids.length === 0) return [];

  const rows = await prisma.rankCheckRun.findMany({
    select: rankCheckRunSelect,
    where: { projectId, deletedAt: null, publicId: { in: ids.map(({ publicId }) => publicId) } },
  });
  const byPublicId = new Map(rows.map((row) => [row.publicId, row]));
  return ids.flatMap(({ publicId }) => {
    const row = byPublicId.get(publicId);
    return row ? [row] : [];
  });
}
