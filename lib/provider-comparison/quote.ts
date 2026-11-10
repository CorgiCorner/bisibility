import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { loadProviderRateContext } from "@/lib/provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { providerConnectionRevision } from "@/lib/providers/connection-revision";
import {
  hostedRankCheckEstimatedCostCents,
  quoteDeploymentRankReservations,
} from "@/lib/providers/execution-extension";
import { exactExecutionEstimate } from "@/lib/providers/execution-extension-estimate";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { comparisonDepth, type FrozenComparison } from "./model";
import { loadComparisonSource } from "./source";
import { comparisonProviders } from "./types";
export async function quoteComparison(
  projectId: string,
  keywordId: string,
  now: Date,
  db: Prisma.TransactionClient = prisma,
): Promise<FrozenComparison> {
  const { keyword, connections, location } = await loadComparisonSource(projectId, keywordId, db);
  if (!keyword.project.domain) throw new Error("Comparison project domain is unavailable.");
  const sides = await quoteComparisonConnections(
    projectId,
    keywordId,
    connections,
    comparisonProviders,
    now,
    db,
  );
  return {
    version: 1,
    keywordId,
    text: keyword.text,
    device: keyword.device,
    domain: keyword.project.domain,
    locationId: keyword.locationId,
    locationLabel: keyword.locationRef.displayName,
    location,
    connections: sides,
  };
}

export async function quoteComparisonConnections(
  projectId: string,
  keywordId: string,
  connections: Awaited<ReturnType<typeof loadComparisonSource>>["connections"],
  providers: readonly (typeof comparisonProviders)[number][],
  now: Date,
  db: Prisma.TransactionClient,
  options: {
    allowDisabled?: boolean;
    depth?: import("@/lib/serp/constants").SerpDepth;
    aiOverview?: true;
  } = {},
): Promise<FrozenComparison["connections"]> {
  const depth = options.depth ?? comparisonDepth;
  if (options.aiOverview && (depth !== 10 || providers.length !== 1 || providers[0] !== "serpapi"))
    throw new Error("Invalid overview quote scope.");
  const billedDepth = options.aiOverview ? 20 : depth;
  const sides: FrozenComparison["connections"] = [];
  for (const provider of providers) {
    const connection = connections.find((side) => side.provider === provider);
    if (
      !connection ||
      (!options.allowDisabled && !connection.enabled) ||
      connection.status !== "connected"
    )
      throw new Error("Selected providers must be connected.");
    const hosted = connection.credentialSource === "hosted";
    const context = hosted
      ? LIST_PROVIDER_RATE_CONTEXT
      : await loadProviderRateContext(connection.id, "rank_check", now, db);
    const providerCost =
      (hosted ? await hostedRankCheckEstimatedCostCents(provider, billedDepth) : null) ??
      estimatedRankCheckCostCents(provider, billedDepth, null, context);
    if (providerCost === null || !Number.isFinite(providerCost) || providerCost <= 0)
      throw new Error("Comparison quote is unavailable.");
    const quantity = provider === "serpapi" ? Math.ceil(billedDepth / 10) : 1;
    const price = hosted
      ? await quoteDeploymentRankReservations(db, {
          projectId,
          connectionId: connection.id,
          source: "app",
          items: [
            {
              keywordId,
              estimatedCostCents: exactExecutionEstimate(providerCost, 4),
              estimatedQuantity: String(quantity),
            },
          ],
        })
      : null;
    const customerCost = hosted ? Number(price?.prices[keywordId]) : providerCost;
    if (!Number.isFinite(customerCost) || customerCost <= 0)
      throw new Error("Comparison customer price is unavailable.");
    sides.push({
      provider,
      id: connection.id,
      revision: providerConnectionRevision(connection),
      credentialVersion: ownCredentialVersion(
        provider,
        connection.id,
        connection.credentialsEncrypted,
      ),
      fundingSource: connection.credentialSource,
      providerEstimateCents: providerCost,
      customerEstimateCents: customerCost,
      quote: {
        provider,
        estimatedCostCents: customerCost,
        nativeUnit: provider === "serpapi" ? "searches" : "cents",
        nativeQuantity: provider === "serpapi" ? quantity : providerCost,
        fundingSource: connection.credentialSource,
      },
    });
  }
  return sides;
}
