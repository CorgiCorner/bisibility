import "server-only";

import { prisma } from "@/lib/db/prisma";
import { READINESS_REASON } from "@/lib/projects/readiness";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { getAnalyticsProvider } from "@/lib/providers/registry";
import type { AnalyticsProvider, AnalyticsQueryStatsInput } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { trafficRuntimeCredentials } from "@/lib/traffic/runtime-credentials";
import { z } from "zod";
import type { ApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { errorResponse, resourceResponse } from "./responses";
import { scopedProject, snakeizeKeys } from "./surface";

const queryStatsQuery = z
  .object({
    clicksMin: z.coerce.number().int().min(0).optional(),
    connectionId: z.string().trim().min(1).max(120).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    impressionsMin: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(1_000).default(100),
    pagePath: z.string().trim().min(1).max(2_048).optional(),
    pagePathMatch: z.enum(["contains", "prefix"]).default("contains"),
    positionMax: z.coerce.number().min(0).optional(),
    query: z.string().trim().min(1).max(1_000).optional(),
    queryMatch: z.enum(["equals", "contains"]).default("equals"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: "start_date must not be after end_date.",
  });

function queryStatsSearchInput(ctx: ApiContext) {
  return {
    clicksMin: ctx.url.searchParams.get("clicks_min") ?? undefined,
    connectionId: ctx.url.searchParams.get("connection_id") ?? undefined,
    endDate: ctx.url.searchParams.get("end_date") ?? "",
    impressionsMin: ctx.url.searchParams.get("impressions_min") ?? undefined,
    limit: ctx.url.searchParams.get("limit") ?? undefined,
    pagePath: ctx.url.searchParams.get("page_path") ?? undefined,
    pagePathMatch: ctx.url.searchParams.get("page_path_match") ?? undefined,
    positionMax: ctx.url.searchParams.get("position_max") ?? undefined,
    query: ctx.url.searchParams.get("query") ?? undefined,
    queryMatch: ctx.url.searchParams.get("query_match") ?? undefined,
    startDate: ctx.url.searchParams.get("start_date") ?? "",
  };
}

function providerInput(input: z.infer<typeof queryStatsQuery>): AnalyticsQueryStatsInput {
  return {
    ...(input.clicksMin === undefined ? {} : { clicks: { min: input.clicksMin } }),
    endDate: input.endDate,
    ...(input.impressionsMin === undefined ? {} : { impressions: { min: input.impressionsMin } }),
    limit: input.limit,
    ...(input.pagePath
      ? {
          pagePath: {
            match: input.pagePathMatch,
            value: input.pagePath,
          },
        }
      : {}),
    ...(input.positionMax === undefined ? {} : { position: { max: input.positionMax } }),
    ...(input.query ? { query: input.query } : {}),
    queryMatch: input.queryMatch,
    startDate: input.startDate,
  };
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
  const input = queryStatsQuery.parse(queryStatsSearchInput(ctx));
  const eligible = await queryConnections(ctx.auth.project.id);
  const requestedConnectionId = input.connectionId
    ? requireApiPublicId(input.connectionId, "conn")
    : null;
  const selected = requestedConnectionId
    ? eligible.find(({ connection }) => connection.publicId === requestedConnectionId)
    : eligible[0];
  if (!selected)
    return errorResponse(
      "not_found",
      `No eligible search-performance source is connected. Reason: ${READINESS_REASON.providerNotConnected}.`,
      404,
      {
        headers: ctx.headers,
        instance: ctx.instance,
      },
    );
  try {
    const rows = await selected.provider.fetchQueryStats(
      trafficRuntimeCredentials(selected.connection),
      providerInput(input),
    );
    return resourceResponse(
      {
        connection: {
          id: requireApiPublicId(selected.connection.publicId ?? "", "conn"),
          label: selected.provider.label,
          provider: selected.provider.id,
        },
        result: {
          row_cap: input.limit,
          rows_returned: rows.length,
          sort: "clicks_desc",
          truncated: rows.length === input.limit,
        },
        rows: rows.map(snakeizeKeys),
        scope: {
          country: null,
          device: null,
          dimensions: input.pagePath ? ["query", "page"] : ["query"],
          end_date: input.endDate,
          page_path: input.pagePath ?? null,
          query_match: input.queryMatch,
          start_date: input.startDate,
        },
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
