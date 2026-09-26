import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import type { ProviderCostFeature } from "@/lib/generated/prisma/enums";
import {
  PROVIDER_RATE_FEATURES,
  type ProviderRateEntry,
  type ProviderRateFeature,
  type ResolveProviderRateInput,
} from "./resolver";

const TRAILING_DAYS = 30;
export const MAX_PROVIDER_RATE_SAMPLES = 50;

export type ProviderRateContext = Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
export type ProviderRateContextMap = ReadonlyMap<string, ProviderRateContext>;

export function providerRateContextKey(
  connectionId: string,
  feature: ProviderCostFeature | ProviderRateFeature,
) {
  return `${connectionId}:${feature}`;
}

type CostEntryRow = ProviderRateEntry & {
  connectionId: string;
  feature: ProviderRateFeature;
};

export async function loadRecentProviderRateEntries(
  connectionIds: readonly string[],
  features: readonly ProviderRateFeature[],
  cutoff: Date,
  client: Pick<PrismaClient, "$queryRaw"> = prisma,
) {
  if (connectionIds.length === 0 || features.length === 0) return [] as CostEntryRow[];
  return client.$queryRaw<CostEntryRow[]>(Prisma.sql`
    SELECT
      "cached",
      "connectionId",
      "costCents",
      "createdAt",
      "failed",
      "feature",
      "unitCostCents"
    FROM (
      SELECT
        "cached",
        "connectionId",
        "costCents",
        "createdAt",
        "failed",
        "feature",
        "unitCostCents",
        ROW_NUMBER() OVER (
          PARTITION BY "connectionId", "feature"
          ORDER BY "createdAt" DESC
        ) AS "sampleRank"
      FROM "provider_cost_entries"
      WHERE
        "cached" = FALSE
        AND "connectionId" IN (${Prisma.join(connectionIds)})
        AND EXISTS (
          SELECT 1 FROM "provider_connections" connection
          WHERE connection.id = "provider_cost_entries"."connectionId"
            AND connection."credentialSource" = "provider_cost_entries"."credentialSource"
        )
        AND "costCents" > 0
        AND "createdAt" >= ${cutoff}
        AND "failed" = FALSE
        AND "feature" IN (${Prisma.join(features)})
    ) AS "rankedProviderCosts"
    WHERE "sampleRank" <= ${MAX_PROVIDER_RATE_SAMPLES}
    ORDER BY "createdAt" DESC
  `);
}

export async function loadProviderRateContexts(
  connectionIds: readonly string[],
  features: readonly ProviderRateFeature[] = PROVIDER_RATE_FEATURES,
  now = new Date(),
  client: Pick<PrismaClient, "$queryRaw" | "providerConnectionRate"> = prisma,
): Promise<ProviderRateContextMap> {
  const uniqueConnectionIds = [...new Set(connectionIds)];
  const uniqueFeatures = [...new Set(features)];
  const cutoff = new Date(now.getTime() - TRAILING_DAYS * 24 * 60 * 60 * 1000);
  const manualRates =
    uniqueConnectionIds.length === 0 || uniqueFeatures.length === 0
      ? []
      : await client.providerConnectionRate.findMany({
          select: { amountCents: true, connectionId: true, feature: true },
          where: {
            connection: { credentialSource: "own" },
            connectionId: { in: uniqueConnectionIds },
            feature: { in: uniqueFeatures },
          },
        });
  const entries = await loadRecentProviderRateEntries(
    uniqueConnectionIds,
    uniqueFeatures,
    cutoff,
    client,
  );
  const contexts = new Map<string, ProviderRateContext>();
  for (const connectionId of uniqueConnectionIds) {
    for (const feature of uniqueFeatures) {
      const key = providerRateContextKey(connectionId, feature);
      contexts.set(key, { entries: [], manualAmountCents: null });
    }
  }
  for (const rate of manualRates) {
    const key = providerRateContextKey(rate.connectionId, rate.feature);
    contexts.set(key, {
      entries: contexts.get(key)?.entries ?? [],
      manualAmountCents: rate.amountCents,
    });
  }
  for (const entry of entries) {
    const key = providerRateContextKey(entry.connectionId, entry.feature);
    const context = contexts.get(key) ?? { entries: [], manualAmountCents: null };
    contexts.set(key, { ...context, entries: [...context.entries, entry] });
  }
  return contexts;
}

export async function loadProviderRateContext(
  connectionId: string,
  feature: ProviderRateFeature,
  now = new Date(),
): Promise<ProviderRateContext> {
  const contexts = await loadProviderRateContexts([connectionId], [feature], now);
  return (
    contexts.get(providerRateContextKey(connectionId, feature)) ?? {
      entries: [],
      manualAmountCents: null,
    }
  );
}
