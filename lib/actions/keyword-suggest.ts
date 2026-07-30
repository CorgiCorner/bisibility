"use server";

import { prisma } from "@/lib/db/prisma";
import {
  sanitizeTopQueries,
  type TopQuerySuggestion,
} from "@/lib/keyword-suggest/sanitize-top-queries";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { getAnalyticsProvider } from "@/lib/providers/registry";
import type { AnalyticsProvider, AnalyticsTopQuery } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const importTopQueriesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  projectId: z.string().min(1),
});

export type ImportTopQueriesInput = {
  limit?: number;
  projectId: string;
};

export type { TopQuerySuggestion } from "@/lib/keyword-suggest/sanitize-top-queries";

export type ImportTopQueriesResult =
  | {
      queries: string[];
      suggestions: TopQuerySuggestion[];
      hidden: TopQuerySuggestion[];
      hiddenCount: number;
    }
  | { queries: []; reason: "needs_reauth" | "no_source" };

type TopQueryProvider = AnalyticsProvider & {
  fetchTopQueries: NonNullable<AnalyticsProvider["fetchTopQueries"]>;
};

function hasTopQueryCapability(provider: AnalyticsProvider): provider is TopQueryProvider {
  return typeof provider.fetchTopQueries === "function";
}

async function findAnalyticsSource(projectId: string) {
  const connections = await prisma.providerConnection.findMany({
    orderBy: providerChainOrderBy(),
    select: { credentialsEncrypted: true, id: true, provider: true },
    where: {
      ...providerChainWhere("analytics"),
      projectId,
    },
  });

  for (const connection of connections) {
    const provider = getAnalyticsProvider(connection.provider);
    if (hasTopQueryCapability(provider)) return { connection, provider };
  }

  return null;
}

export async function importTopQueries(input: unknown): Promise<ImportTopQueriesResult> {
  const data = parseActionInput(importTopQueriesSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "project" });
  const source = await findAnalyticsSource(project.id);

  if (!source) {
    return { queries: [], reason: "no_source" };
  }

  const credentials = resolveProviderCredentials(
    source.connection.provider,
    source.connection.credentialsEncrypted,
  );
  const gate = await consumeProviderLimit(source.connection.provider, credentials, {
    projectId: project.id,
  });
  if (!gate.success) {
    throw new Error("Rate limited, try again shortly.");
  }

  let rows: AnalyticsTopQuery[];
  try {
    rows = await source.provider.fetchTopQueries(credentials, { limit: data.limit });
  } catch (error) {
    if (!(error instanceof ProviderAuthError)) throw error;
    await markProviderNeedsReauth({
      connectionId: source.connection.id,
      projectId: project.id,
      provider: source.connection.provider,
    });
    return { queries: [], reason: "needs_reauth" };
  }
  const { suggestions, hidden, hiddenCount } = sanitizeTopQueries(rows, data.limit);
  return {
    hidden,
    hiddenCount,
    queries: suggestions.map((suggestion) => suggestion.query),
    suggestions,
  };
}
