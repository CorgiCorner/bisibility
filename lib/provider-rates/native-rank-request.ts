import "server-only";
import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import type { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import type { SerpDepth } from "@/lib/serp/constants";
import { formatQuantity } from "@usagekit/core";
import { nativeProviderCatalog } from "./catalog-source";
import { loadNativeProviderQuote, ProviderQuoteUnavailableError } from "./native-quote";

type Database = Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">;
type Connection = {
  id?: string;
  provider: string;
  credentialSource?: string;
  credentialsEncrypted: string | null;
};
export type NativeRankRequest = {
  keyword: string;
  depth: SerpDepth;
  priority?: "normal" | "high";
};

/** Requests sharing only price-relevant options share a quote, never their search content. */
export async function loadNativeRankRequestCosts(
  db: Database,
  connection: Connection,
  requests: readonly NativeRankRequest[],
  now = new Date(),
): Promise<readonly (number | null)[] | undefined> {
  if (
    !["dataforseo", "serpapi"].includes(connection.provider) ||
    connection.credentialSource !== "own"
  )
    return undefined;
  const unavailable = () => requests.map(() => null);
  if (!connection.id) return unavailable();
  const current = await db.providerConnection.findUnique({
    where: { id: connection.id },
    select: {
      projectId: true,
      project: { select: { ownerId: true } },
      enabled: true,
      status: true,
    },
  });
  const version = ownCredentialVersion(
    connection.provider,
    connection.id,
    connection.credentialsEncrypted,
  );
  if (!current || !current.enabled || current.status !== "connected" || !version)
    return unavailable();
  const binding = {
    namespace: meteringNamespace(),
    principal: current.project.ownerId,
    projectId: current.projectId,
    connectionId: connection.id,
    provider: connection.provider,
    providerCredentialVersion: version,
    fundingSource: "byok" as const,
  };
  const quotes = new Map<string, number | null>();
  const costs: (number | null)[] = [];
  for (const request of requests) {
    const search = connection.provider === "serpapi";
    const units = search ? pagesPerCheck(request.depth) : 1;
    const matched = nativeProviderCatalog.match(
      connection.provider,
      search
        ? {
            method: "GET",
            url: `https://serpapi.com/search.json?q=${encodeURIComponent(request.keyword)}`,
          }
        : {
            method: "POST",
            url: request.priority
              ? "/v3/serp/google/organic/task_post"
              : "/v3/serp/google/organic/live/advanced",
            body: [
              {
                keyword: request.keyword,
                depth: request.depth,
                search_param: "&nfpr=1",
                ...(request.priority ? { priority: request.priority === "high" ? 2 : 1 } : {}),
              },
            ],
          },
    );
    if (matched.operation === "unknown") {
      costs.push(null);
      continue;
    }
    const key = JSON.stringify([
      matched.operation.id,
      Object.entries(matched.options).sort(),
      units,
    ]);
    if (!quotes.has(key)) {
      try {
        const quote = await loadNativeProviderQuote(
          db,
          binding,
          "rank_check",
          matched.operation.id,
          matched.options,
          now,
          units,
        );
        const amount = quote.quantities.find(
          (quantity) => quantity.unit === (search ? "budget_cents" : "cents"),
        );
        quotes.set(
          key,
          amount
            ? Number(formatQuantity({ ...amount, value: amount.value * BigInt(units) }))
            : null,
        );
      } catch (error) {
        if (!(error instanceof ProviderQuoteUnavailableError)) throw error;
        quotes.set(key, null);
      }
    }
    costs.push(quotes.get(key) ?? null);
  }
  return costs;
}
