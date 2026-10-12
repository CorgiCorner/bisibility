import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ProviderQuoteUnavailableError } from "@/lib/provider-rates/native-quote";
import { loadNativeRankRequestCosts } from "@/lib/provider-rates/native-rank-request";
import type { SerpDepth } from "@/lib/serp/constants";
import type { DataForSeoQueuePriority } from "./queued-config";
import { dataForSeoQueuedEstimate } from "./queued-pricing";

/** Own-key budgets and journals use one credential-bound quote per actual request. */
export async function queuedRequestCosts(
  connection: Parameters<typeof loadNativeRankRequestCosts>[1],
  requests: readonly { keyword: string; depth: SerpDepth }[],
  priority: DataForSeoQueuePriority,
  db: Parameters<typeof loadNativeRankRequestCosts>[0] = prisma,
  now = new Date(),
): Promise<number[]> {
  if (connection.provider !== "dataforseo") throw new ProviderQuoteUnavailableError();
  const costs = await loadNativeRankRequestCosts(
    db,
    connection,
    requests.map((request) => ({ ...request, priority })),
    now,
  );
  return requests.map((request, index) => {
    const amount = costs
      ? costs[index]
      : dataForSeoQueuedEstimate(priority, request.depth, request.keyword);
    if (amount === null || amount === undefined) throw new ProviderQuoteUnavailableError();
    return amount;
  });
}
