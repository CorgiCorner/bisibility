import "server-only";

import { requireApiPublicId } from "@/lib/api/public-id";
import { rankedKeywordPageRate } from "@/lib/cost-estimate/provider-rates";
import { prisma } from "@/lib/db/prisma";
import { normalizeDomain } from "@/lib/domains/normalize";
import { ProviderLookupSignal, paidProviderCall } from "@/lib/provider-lookups/paid-call";
import { getSerpProvider } from "@/lib/providers/registry";
import type { RankedKeywordRow, SerpProvider } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { serpRankLocation } from "@/lib/serp/location";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import {
  type RankedKeywordsCacheEntry,
  rankedKeywordsCacheKey,
  withRankedKeywordsCache,
} from "./cache";

export type RankedKeywordConnection = { id: string; label: string; provider: string };
export type RankedKeywordSuggestion = RankedKeywordRow & { alreadyTracked: boolean };
export type RankedKeywordsSuccess = {
  cached: boolean;
  connections: RankedKeywordConnection[];
  costCents: number;
  fetchedAt: string;
  offset: number;
  rows: RankedKeywordSuggestion[];
  totalCount: number | null;
};
export type RankedKeywordsOutcome =
  | ({ ok: true } & RankedKeywordsSuccess)
  | {
      ok: false;
      reason:
        | "budget_exhausted"
        | "needs_reauth"
        | "no_domain"
        | "no_source"
        | "rate_limited"
        | "unsupported_location";
      resetAt?: number;
    };

type CapableProvider = SerpProvider & {
  fetchRankedKeywords: NonNullable<SerpProvider["fetchRankedKeywords"]>;
};

class RankedKeywordsOutcomeSignal extends Error {
  constructor(readonly outcome: Exclude<RankedKeywordsOutcome, { ok: true }>) {
    super(outcome.reason);
  }
}

function capable(provider: SerpProvider): provider is CapableProvider {
  return typeof provider.fetchRankedKeywords === "function";
}

function isUnknownSerpProviderError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Unknown SERP provider:");
}

async function projectState(projectId: string) {
  return prisma.project.findFirst({
    select: {
      budgetCapCents: true,
      defaults: { include: { locationRef: true } },
      domain: true,
      id: true,
      keywords: { select: { device: true, location: true, locationRef: true, text: true } },
      providerConnections: {
        orderBy: providerChainOrderBy(),
        select: { credentialsEncrypted: true, id: true, provider: true, publicId: true },
        where: providerChainWhere("serp"),
      },
      publicId: true,
    },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
}

function eligibleConnections(project: NonNullable<Awaited<ReturnType<typeof projectState>>>) {
  return project.providerConnections.flatMap((connection) => {
    try {
      const provider = getSerpProvider(connection.provider);
      return capable(provider) ? [{ connection, provider }] : [];
    } catch (error) {
      if (!isUnknownSerpProviderError(error)) throw error;
      return [];
    }
  });
}

export async function listEligibleRankedKeywordConnections(projectId: string) {
  const project = await projectState(projectId);
  if (!project) return [];
  return eligibleConnections(project).map(({ connection, provider }) => ({
    id: requireApiPublicId(connection.publicId ?? "", "conn"),
    label: provider.label,
    provider: provider.id,
  }));
}

async function resolvedLocation(project: NonNullable<Awaited<ReturnType<typeof projectState>>>) {
  const market = projectDefaultSerpMarket(project.defaults, project.keywords);
  const persisted =
    project.defaults?.locationRef ??
    project.keywords.find((keyword) => keyword.locationRef?.canonicalKey === market.locationKey)
      ?.locationRef;
  if (persisted) return { key: persisted.canonicalKey, value: serpRankLocation(persisted) };
  const resolved = await resolveKeywordLocation({
    projectId: project.id,
    selection: { canonicalKey: market.locationKey, kind: "city" },
  });
  return { key: resolved.location.canonicalKey, value: serpRankLocation(resolved.location) };
}

function annotate(rows: RankedKeywordRow[], texts: string[]) {
  const tracked = new Set(texts.map((text) => text.trim().toLowerCase()));
  return rows.map((row) => ({
    ...row,
    alreadyTracked: tracked.has(row.keyword.trim().toLowerCase()),
  }));
}

function success(
  entry: RankedKeywordsCacheEntry,
  cached: boolean,
  offset: number,
  connections: RankedKeywordConnection[],
  texts: string[],
): RankedKeywordsOutcome {
  return {
    cached,
    connections,
    costCents: entry.costCents,
    fetchedAt: entry.fetchedAt,
    offset,
    ok: true,
    rows: annotate(entry.rows, texts),
    totalCount: entry.totalCount,
  };
}

export async function fetchRankedKeywords(input: {
  actorId?: string | null;
  connectionId?: string;
  fresh?: boolean;
  limit: number;
  offset: number;
  projectId: string;
}): Promise<RankedKeywordsOutcome> {
  const project = await projectState(input.projectId);
  if (!project) return { ok: false, reason: "no_source" };
  const domain = normalizeDomain(project.domain);
  if (!domain) return { ok: false, reason: "no_domain" };
  const eligible = eligibleConnections(project);
  const requestedConnectionId = input.connectionId
    ? requireApiPublicId(input.connectionId, "conn")
    : undefined;
  const selected = requestedConnectionId
    ? eligible.find(({ connection }) => connection.publicId === requestedConnectionId)
    : eligible[0];
  if (!selected) return { ok: false, reason: "no_source" };
  const connections = eligible.map(({ connection, provider }) => ({
    id: requireApiPublicId(connection.publicId ?? "", "conn"),
    label: provider.label,
    provider: provider.id,
  }));
  const location = await resolvedLocation(project);
  const key = rankedKeywordsCacheKey({
    connectionId: selected.connection.id,
    limit: input.limit,
    locationKey: location.key,
    normalizedDomain: domain,
    offset: input.offset,
    projectId: project.id,
  });
  try {
    const lookup = await withRankedKeywordsCache({
      fresh: input.fresh,
      key,
      load: async () => {
        const page = await paidProviderCall({
          budgetCapCents: project.budgetCapCents,
          call: (credentials) =>
            selected.provider.fetchRankedKeywords(credentials, {
              domain,
              limit: input.limit,
              location: location.value,
              offset: input.offset,
            }),
          connection: selected.connection,
          feature: "ranked_keywords",
          itemCount: input.limit,
          projectId: project.id,
          provider: selected.provider,
          rate: rankedKeywordPageRate(selected.provider.id),
        });
        const entry = { ...page, fetchedAt: new Date().toISOString() };
        return entry;
      },
    });
    if (lookup.status === "contended") {
      return { ok: false, reason: "rate_limited", resetAt: lookup.resetAt };
    }
    return success(
      lookup.value,
      lookup.cached,
      input.offset,
      connections,
      project.keywords.map((row) => row.text),
    );
  } catch (error) {
    if (error instanceof ProviderLookupSignal) {
      if (
        error.outcome.reason === "budget_exhausted" ||
        error.outcome.reason === "needs_reauth" ||
        error.outcome.reason === "rate_limited" ||
        error.outcome.reason === "unsupported_location"
      ) {
        return {
          ok: false,
          reason: error.outcome.reason,
          ...(error.outcome.resetAt === undefined ? {} : { resetAt: error.outcome.resetAt }),
        };
      }
    }
    if (error instanceof RankedKeywordsOutcomeSignal) return error.outcome;
    throw error;
  }
}
