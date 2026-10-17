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
  const sides: FrozenComparison["connections"] = [];
  for (const provider of comparisonProviders) {
    const connection = connections.find((side) => side.provider === provider);
    if (!connection?.enabled || connection.status !== "connected")
      throw new Error("Both comparison providers must be connected.");
    const hosted = connection.credentialSource === "hosted";
    const context = hosted
      ? LIST_PROVIDER_RATE_CONTEXT
      : await loadProviderRateContext(connection.id, "rank_check", now, db);
    const providerCost =
      (hosted ? hostedRankCheckEstimatedCostCents(provider, comparisonDepth) : null) ??
      estimatedRankCheckCostCents(provider, comparisonDepth, null, context);
    if (providerCost === null || !Number.isFinite(providerCost) || providerCost <= 0)
      throw new Error("Comparison quote is unavailable.");
    const quantity = provider === "serpapi" ? 2 : 1;
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
