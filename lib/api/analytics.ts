import "server-only";

import { prisma } from "@/lib/db/prisma";
import { syncProjectTrafficNow } from "@/lib/traffic/sync-now";
import { z } from "zod";
import type { ApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { resourceResponse } from "./responses";
import { scopedProject, snakeizeKeys } from "./surface";

export { listSearchPerformanceQueryStats } from "./analytics-query-stats";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateFields = { endDate: isoDate, startDate: isoDate };
const validRange = (value: { endDate: string; startDate: string }) =>
  value.startDate <= value.endDate;
const rangeError = { message: "start_date must not be after end_date." };

const snapshotQuery = z
  .object({
    ...dateFields,
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    paths: z.array(z.string().trim().min(1).max(2_048)).max(50),
  })
  .refine(validRange, rangeError);

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function rangeInput(ctx: ApiContext) {
  return {
    endDate: ctx.url.searchParams.get("end_date") ?? "",
    startDate: ctx.url.searchParams.get("start_date") ?? "",
  };
}

type TrafficSnapshotResource = {
  bounceRate: number | null;
  createdAt: Date;
  date: Date;
  engagementRate: number | null;
  keyEvents: number | null;
  path: string;
  provider: string;
  scrollDepth: number | null;
  sessions: number;
  updatedAt: Date;
  visitDurationSeconds: number | null;
  visitors: number | null;
  windowDays: number;
};

function snapshotResource(row: TrafficSnapshotResource) {
  return {
    bounce_rate: row.bounceRate,
    created_at: row.createdAt.toISOString(),
    date: row.date.toISOString().slice(0, 10),
    engagement_rate: row.engagementRate,
    key_events: row.keyEvents,
    path: row.path,
    provider: row.provider,
    scroll_depth: row.scrollDepth,
    sessions: row.sessions,
    updated_at: row.updatedAt.toISOString(),
    visit_duration_seconds: row.visitDurationSeconds,
    visitors: row.visitors,
    window_days: row.windowDays,
  };
}

export async function listTrafficSnapshots(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = snapshotQuery.parse({
    ...rangeInput(ctx),
    limit: ctx.url.searchParams.get("limit") ?? undefined,
    offset: ctx.url.searchParams.get("offset") ?? undefined,
    paths: ctx.url.searchParams.getAll("path"),
  });
  const where = {
    date: { gte: parseDate(input.startDate), lte: parseDate(input.endDate) },
    ...(input.paths.length ? { path: { in: input.paths } } : {}),
    projectId: ctx.auth.project.id,
  };
  const [rows, totalCount] = await Promise.all([
    prisma.pageTrafficSnapshot.findMany({
      orderBy: [{ date: "desc" }, { path: "asc" }, { provider: "asc" }],
      select: {
        bounceRate: true,
        createdAt: true,
        date: true,
        engagementRate: true,
        keyEvents: true,
        path: true,
        provider: true,
        scrollDepth: true,
        sessions: true,
        updatedAt: true,
        visitDurationSeconds: true,
        visitors: true,
        windowDays: true,
      },
      skip: input.offset,
      take: input.limit,
      where,
    }),
    prisma.pageTrafficSnapshot.count({ where }),
  ]);
  return resourceResponse(
    { offset: input.offset, rows: rows.map(snapshotResource), total_count: totalCount },
    { headers: ctx.headers },
  );
}

export async function syncProjectTrafficApi(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const summary = await syncProjectTrafficNow({
    actorId: ctx.actorId,
    projectId: ctx.auth.project.id,
  });
  const connectionIds = [...new Set(summary.runs.map((run) => run.connectionId))];
  const connections = connectionIds.length
    ? await prisma.providerConnection.findMany({
        select: { id: true, publicId: true },
        where: { id: { in: connectionIds }, projectId: ctx.auth.project.id },
      })
    : [];
  const publicConnectionIds = new Map(
    connections.map((connection) => [
      connection.id,
      requireApiPublicId(connection.publicId ?? "", "conn"),
    ]),
  );
  return resourceResponse(
    {
      connections: summary.connections,
      keyword_snapshots: summary.keywordSnapshots,
      page_snapshots: summary.pageSnapshots,
      project_id: requireApiPublicId(projectId, "prj"),
      runs: summary.runs.map(({ connectionId, ...run }) => ({
        ...(snakeizeKeys(run) as Record<string, unknown>),
        connection_id: requireApiPublicId(publicConnectionIds.get(connectionId) ?? "", "conn"),
      })),
      skipped: summary.skipped.map(snakeizeKeys),
    },
    { headers: ctx.headers },
  );
}
