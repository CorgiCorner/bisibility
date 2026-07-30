import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { getAnalyticsProvider } from "@/lib/providers/registry";
import type { AnalyticsProvider } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { trafficRuntimeCredentials } from "@/lib/traffic/runtime-credentials";
import { syncProjectTrafficNow } from "@/lib/traffic/sync-now";
import { z } from "zod";
import type { ApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { errorResponse, resourceResponse } from "./responses";
import { scopedProject, snakeizeKeys } from "./surface";

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

const queryStatsQuery = z
  .object({
    ...dateFields,
    connectionId: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(1_000).default(100),
    query: z.string().trim().min(1).max(1_000).optional(),
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

type QueryProvider = AnalyticsProvider & {
  fetchQueryStats: NonNullable<AnalyticsProvider["fetchQueryStats"]>;
};

function queryCapable(provider: AnalyticsProvider): provider is QueryProvider {
  return typeof provider.fetchQueryStats === "function";
}

async function queryConnections(projectId: string) {
  const connections = await prisma.providerConnection.findMany({
    orderBy: providerChainOrderBy(),
    select: { credentialsEncrypted: true, id: true, provider: true, publicId: true },
    where: { ...providerChainWhere("analytics"), projectId },
  });
  return connections.flatMap((connection) => {
    const provider = getAnalyticsProvider(connection.provider);
    return queryCapable(provider) ? [{ connection, provider }] : [];
  });
}

export async function listSearchPerformanceQueryStats(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = queryStatsQuery.parse({
    ...rangeInput(ctx),
    connectionId: ctx.url.searchParams.get("connection_id") ?? undefined,
    limit: ctx.url.searchParams.get("limit") ?? undefined,
    query: ctx.url.searchParams.get("query") ?? undefined,
  });
  const eligible = await queryConnections(ctx.auth.project.id);
  const requestedConnectionId = input.connectionId
    ? requireApiPublicId(input.connectionId, "conn")
    : null;
  const selected = requestedConnectionId
    ? eligible.find(({ connection }) => connection.publicId === requestedConnectionId)
    : eligible[0];
  if (!selected)
    return errorResponse("not_found", "No eligible search-performance source is connected.", 404, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  try {
    const rows = await selected.provider.fetchQueryStats(
      trafficRuntimeCredentials(selected.connection),
      input,
    );
    return resourceResponse(
      {
        connection: {
          id: requireApiPublicId(selected.connection.publicId ?? "", "conn"),
          label: selected.provider.label,
          provider: selected.provider.id,
        },
        rows: rows.map(snakeizeKeys),
      },
      { headers: ctx.headers },
    );
  } catch (error) {
    if (!(error instanceof ProviderAuthError)) throw error;
    await markProviderNeedsReauth({
      connectionId: selected.connection.id,
      projectId: ctx.auth.project.id,
      provider: selected.provider.id,
    });
    return errorResponse("provider_unavailable", "Provider authorization must be renewed.", 422, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
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
