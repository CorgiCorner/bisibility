import "server-only";

import { prisma } from "@/lib/db/prisma";
import { READINESS_REASON } from "@/lib/projects/readiness";
import { gscQueryDimensions } from "@/lib/providers/analytics/gsc-query-pagination";
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

const searchPerformanceDimension = z.enum(["query", "page", "country", "device"]);

export const queryStatsQuery = z
  .object({
    clicksMin: z.coerce.number().int().min(0).optional(),
    connectionId: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^conn_[a-z][a-z0-9]{23}$/)
      .optional(),
    country: z
      .string()
      .trim()
      .regex(/^[a-zA-Z]{3}$/)
      .transform((value) => value.toLowerCase())
      .optional(),
    device: z.enum(["desktop", "mobile", "tablet"]).optional(),
    dimensions: z
      .string()
      .regex(/^\s*(query|page|country|device)\s*(,\s*(query|page|country|device)\s*)*$/)
      .transform((value) => value.split(",").map((part) => part.trim()))
      .pipe(z.array(searchPerformanceDimension))
      .optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    impressionsMin: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(1_000).default(100),
    offset: z.coerce.number().int().min(0).default(0),
    pagePath: z.string().trim().min(1).max(2_048).optional(),
    pagePathMatch: z.enum(["contains", "prefix"]).default("contains"),
    positionMax: z.coerce.number().min(0).optional(),
    query: z.string().trim().min(1).max(1_000).optional(),
    queryMatch: z.enum(["equals", "contains"]).default("equals"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: "start_date must not be after end_date.",
  })
  .refine((value) => value.dimensions === undefined || value.dimensions.includes("query"), {
    message: "dimensions must include query.",
    path: ["dimensions"],
  });

function queryStatsSearchInput(ctx: ApiContext) {
  return {
    clicksMin: ctx.url.searchParams.get("clicks_min") ?? undefined,
    connectionId: ctx.url.searchParams.get("connection_id") ?? undefined,
    country: ctx.url.searchParams.get("country") ?? undefined,
    device: ctx.url.searchParams.get("device") ?? undefined,
    dimensions: ctx.url.searchParams.get("dimensions") ?? undefined,
    endDate: ctx.url.searchParams.get("end_date") ?? "",
    impressionsMin: ctx.url.searchParams.get("impressions_min") ?? undefined,
    limit: ctx.url.searchParams.get("limit") ?? undefined,
    offset: ctx.url.searchParams.get("offset") ?? undefined,
    pagePath: ctx.url.searchParams.get("page_path") ?? undefined,
    pagePathMatch: ctx.url.searchParams.get("page_path_match") ?? undefined,
    positionMax: ctx.url.searchParams.get("position_max") ?? undefined,
    query: ctx.url.searchParams.get("query") ?? undefined,
    queryMatch: ctx.url.searchParams.get("query_match") ?? undefined,
    startDate: ctx.url.searchParams.get("start_date") ?? "",
  };
}

function providerInput(input: z.infer<typeof queryStatsQuery>): AnalyticsQueryStatsInput {
  const stats: AnalyticsQueryStatsInput = {
    ...(input.clicksMin === undefined ? {} : { clicks: { min: input.clicksMin } }),
    ...(input.country ? { country: input.country } : {}),
    ...(input.device ? { device: input.device } : {}),
    endDate: input.endDate,
    ...(input.impressionsMin === undefined ? {} : { impressions: { min: input.impressionsMin } }),
    limit: input.limit,
    offset: input.offset,
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
  return {
    ...stats,
    dimensions: gscQueryDimensions({
      ...stats,
      ...(input.dimensions ? { dimensions: input.dimensions } : {}),
    }),
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
  const requested = providerInput(input);
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
      requested,
    );
    const truncated = rows.length === input.limit;
    return resourceResponse(
      {
        connection: {
          id: requireApiPublicId(selected.connection.publicId ?? "", "conn"),
          label: selected.provider.label,
          provider: selected.provider.id,
        },
        result: {
          next_offset: truncated ? input.offset + input.limit : null,
          row_cap: input.limit,
          rows_returned: rows.length,
          sort: "clicks_desc",
          truncated,
        },
        rows: rows.map(snakeizeKeys),
        scope: {
          country: input.country ?? null,
          device: input.device ?? null,
          dimensions: requested.dimensions,
          end_date: input.endDate,
          offset: input.offset,
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
