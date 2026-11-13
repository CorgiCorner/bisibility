import "server-only";

import { prisma } from "@/lib/db/prisma";
import { pagePathForProject, pagePathHash } from "@/lib/pages/page-path";
import { utcDay } from "./dates";
import { GA4_KEY_EVENTS_DISPLAY_NAME, GA4_KEY_EVENTS_NAME } from "./types";

const WRITE_CHUNK = 400;
const COUNT_LIMIT = 2_147_483_647;

type OrganicRow = {
  date: Date;
  keyEvents: number | null;
  path: string;
};

type Aggregate = {
  count: number;
  date: Date;
  path: string;
  pathHash: string;
};

type ExistingRow = {
  count: number;
  date: Date;
  id: string;
  path: string;
  pathHash: string;
};

export type Ga4ProjectionResult = {
  created: number;
  deleted: number;
  updated: number;
};

function aggregateKey(date: Date, pathHash: string) {
  return `${utcDay(date).getTime()}:${pathHash}`;
}

export function aggregateGa4KeyEvents(domain: string, rows: readonly OrganicRow[]) {
  const grouped = new Map<string, Aggregate>();
  for (const row of rows) {
    if (row.keyEvents == null || row.keyEvents <= 0) continue;
    const path = pagePathForProject(domain, row.path);
    if (!path) continue;
    const date = utcDay(row.date);
    const pathHash = pagePathHash(path);
    const key = aggregateKey(date, pathHash);
    const current = grouped.get(key);
    const next = (current?.count ?? 0) + row.keyEvents;
    grouped.set(key, {
      count: next > COUNT_LIMIT ? COUNT_LIMIT : next,
      date,
      path,
      pathHash,
    });
  }
  return [...grouped.values()];
}

async function loadExisting(
  projectId: string,
  range: { from: Date; to: Date } | undefined,
): Promise<ExistingRow[]> {
  return prisma.conversionDaily.findMany({
    select: { count: true, date: true, id: true, path: true, pathHash: true },
    where: {
      name: GA4_KEY_EVENTS_NAME,
      projectId,
      source: "ga4",
      ...(range ? { date: { gte: utcDay(range.from), lte: utcDay(range.to) } } : {}),
    },
  });
}

async function upsertGoal(projectId: string, aggregated: readonly Aggregate[]) {
  const firstSeen = aggregated.reduce(
    (min, row) => (row.date.getTime() < min.getTime() ? row.date : min),
    aggregated[0]?.date ?? new Date(0),
  );
  const lastSeen = aggregated.reduce(
    (max, row) => (row.date.getTime() > max.getTime() ? row.date : max),
    aggregated[0]?.date ?? new Date(0),
  );
  const goal = await prisma.conversionGoal.findUnique({
    select: { firstSeen: true, id: true, lastSeen: true },
    where: {
      projectId_source_sourceName: {
        projectId,
        source: "ga4",
        sourceName: GA4_KEY_EVENTS_NAME,
      },
    },
  });
  if (!goal) {
    await prisma.conversionGoal.create({
      data: {
        displayName: GA4_KEY_EVENTS_DISPLAY_NAME,
        firstSeen,
        lastSeen,
        projectId,
        source: "ga4",
        sourceName: GA4_KEY_EVENTS_NAME,
      },
    });
    return;
  }
  const nextFirst = goal.firstSeen.getTime() <= firstSeen.getTime() ? goal.firstSeen : firstSeen;
  const nextLast = goal.lastSeen.getTime() >= lastSeen.getTime() ? goal.lastSeen : lastSeen;
  if (
    nextFirst.getTime() === goal.firstSeen.getTime() &&
    nextLast.getTime() === goal.lastSeen.getTime()
  ) {
    return;
  }
  await prisma.conversionGoal.update({
    data: { firstSeen: utcDay(nextFirst), lastSeen: utcDay(nextLast) },
    where: { id: goal.id },
  });
}

/**
 * Projects non-zero GA4 organic key events into the daily conversion table.
 * A second run with the same rows does not write. Per-event names are a follow-up.
 */
export async function projectGa4KeyEvents(
  projectId: string,
  range?: { from: Date; to: Date },
): Promise<Ga4ProjectionResult> {
  const empty = { created: 0, deleted: 0, updated: 0 };
  const project = await prisma.project.findUnique({
    select: { domain: true },
    where: { id: projectId },
  });
  if (!project?.domain) return empty;
  const organic = await prisma.organicSessionsPageDaily.findMany({
    select: { date: true, keyEvents: true, path: true },
    where: {
      keyEvents: { gt: 0 },
      projectId,
      ...(range ? { date: { gte: utcDay(range.from), lte: utcDay(range.to) } } : {}),
    },
  });
  const aggregated = aggregateGa4KeyEvents(project.domain, organic);
  const existing = await loadExisting(projectId, range);
  const wanted = new Map(aggregated.map((row) => [aggregateKey(row.date, row.pathHash), row]));
  const present = new Map(existing.map((row) => [aggregateKey(row.date, row.pathHash), row]));
  const creates = aggregated.filter((row) => !present.has(aggregateKey(row.date, row.pathHash)));
  const updates = aggregated.filter((row) => {
    const current = present.get(aggregateKey(row.date, row.pathHash));
    return current != null && (current.count !== row.count || current.path !== row.path);
  });
  const staleIds = existing
    .filter((row) => !wanted.has(aggregateKey(row.date, row.pathHash)))
    .map((row) => row.id);
  if (creates.length === 0 && updates.length === 0 && staleIds.length === 0) {
    if (aggregated.length > 0) await upsertGoal(projectId, aggregated);
    return empty;
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < creates.length; index += WRITE_CHUNK) {
      await tx.conversionDaily.createMany({
        data: creates.slice(index, index + WRITE_CHUNK).map((row) => ({
          count: row.count,
          createdAt: now,
          date: row.date,
          name: GA4_KEY_EVENTS_NAME,
          path: row.path,
          pathHash: row.pathHash,
          projectId,
          source: "ga4" as const,
          updatedAt: now,
        })),
      });
    }
    for (const row of updates) {
      const current = present.get(aggregateKey(row.date, row.pathHash));
      if (!current) continue;
      await tx.conversionDaily.update({
        data: { count: row.count, path: row.path },
        where: { id: current.id },
      });
    }
    if (staleIds.length > 0) {
      await tx.conversionDaily.deleteMany({ where: { id: { in: staleIds } } });
    }
  });
  if (aggregated.length > 0) await upsertGoal(projectId, aggregated);
  return { created: creates.length, deleted: staleIds.length, updated: updates.length };
}

/** Full scan for organic key events already stored before this table existed. */
export function backfillGa4KeyEvents(projectId: string) {
  return projectGa4KeyEvents(projectId);
}
