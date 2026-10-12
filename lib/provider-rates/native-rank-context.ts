import "server-only";
import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import type { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { serpDepthValues } from "@/lib/serp/constants";
import { formatQuantity } from "@usagekit/core";
import { nativeProviderCatalog } from "./catalog-source";
import { loadNativeProviderQuote, ProviderQuoteUnavailableError } from "./native-quote";
import type { ProviderRateContext } from "./resolver";

type Database = Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">;

/** One complete quote per supported depth; no scaling of measurements between variants. */
export async function loadNativeRankContexts(
  db: Database,
  connectionIds: readonly string[],
  now: Date,
): Promise<ReadonlyMap<string, NonNullable<ProviderRateContext["nativeRankCosts"]>>> {
  if (!connectionIds.length) return new Map();
  const connections = await db.providerConnection.findMany({
    where: {
      id: { in: [...connectionIds] },
      provider: { in: ["dataforseo", "serpapi"] },
      credentialSource: "own",
    },
    select: {
      id: true,
      provider: true,
      projectId: true,
      project: { select: { ownerId: true } },
      credentialsEncrypted: true,
      enabled: true,
      status: true,
    },
  });
  const result = new Map<string, NonNullable<ProviderRateContext["nativeRankCosts"]>>();
  for (const connection of connections) {
    const costs: Record<number, number | null> = Object.fromEntries(
      serpDepthValues.map((depth) => [depth, null]),
    );
    result.set(connection.id, { provider: connection.provider, centsByDepth: costs });
    const version = ownCredentialVersion(
      connection.provider,
      connection.id,
      connection.credentialsEncrypted,
    );
    if (!version || !connection.enabled || connection.status !== "connected") continue;
    for (const depth of serpDepthValues) {
      const search = connection.provider === "serpapi";
      const units = search ? pagesPerCheck(depth) : 1;
      const matched = nativeProviderCatalog.match(
        connection.provider,
        search
          ? {
              method: "GET",
              url: "https://serpapi.com/search.json",
            }
          : {
              method: "POST",
              url: "/v3/serp/google/organic/live/advanced",
              body: [{ depth }],
            },
      );
      if (matched.operation === "unknown") continue;
      try {
        const quote = await loadNativeProviderQuote(
          db,
          {
            namespace: meteringNamespace(),
            principal: connection.project.ownerId,
            projectId: connection.projectId,
            connectionId: connection.id,
            provider: connection.provider,
            providerCredentialVersion: version,
            fundingSource: "byok",
          },
          "rank_check",
          matched.operation.id,
          matched.options,
          now,
          units,
        );
        const amount = quote.quantities.find(
          (quantity) => quantity.unit === (search ? "budget_cents" : "cents"),
        );
        if (amount)
          costs[depth] = Number(formatQuantity({ ...amount, value: amount.value * BigInt(units) }));
      } catch (error) {
        if (!(error instanceof ProviderQuoteUnavailableError)) throw error;
      }
    }
  }
  return result;
}
