import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { nativeProviderCatalog } from "@/lib/provider-rates/catalog-source";
import type { SerpDepth } from "@/lib/serp/constants";
import { formatQuantity } from "@usagekit/core";
import type { DataForSeoQueuePriority } from "./queued-config";

export function queuedBillingUnits(depth: SerpDepth) {
  return pagesPerCheck(depth);
}

export function dataForSeoQueuedEstimate(
  priority: DataForSeoQueuePriority,
  depth: SerpDepth,
  keyword = "",
) {
  const matched = nativeProviderCatalog.match("dataforseo", {
    method: "POST",
    url: "/v3/serp/google/organic/task_post",
    body: [{ keyword, depth, priority: priority === "high" ? 2 : 1, search_param: "&nfpr=1" }],
  });
  if (matched.operation === "unknown") throw new Error("Queued request pricing is unavailable");
  const quote = nativeProviderCatalog.estimate(
    { id: "queued-catalog", provider: "dataforseo", fundingSource: "byok" },
    matched.operation.id,
    matched.options,
  );
  const amount = quote.quantities.find((quantity) => quantity.unit === "cents");
  if (quote.source === "unknown" || !amount)
    throw new Error("Queued request pricing is unavailable");
  return Number(formatQuantity(amount));
}
