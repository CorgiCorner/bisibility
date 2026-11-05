import type { DataForSeoItem } from "@/lib/providers/serp/dataforseo-payload";
import { dataForSeoOrganicDecision } from "@/lib/providers/serp/dataforseo-payload";
import type { SerpDepth } from "@/lib/serp/constants";
import type { dataForSeoQueuedResponseTask } from "./queued-provider-poll";

type ProviderTask = NonNullable<ReturnType<typeof dataForSeoQueuedResponseTask>>;

export function queuedPartialResult(
  task: ProviderTask,
  domain: string,
  depth: SerpDepth,
  resolvedItems?: readonly (DataForSeoItem | null)[],
) {
  const items =
    resolvedItems ??
    (Array.isArray(task.result) ? task.result.flatMap((result) => result.items ?? []) : []);
  const decision = dataForSeoOrganicDecision(items, domain, depth);
  const organicCount = items.filter((item) => item?.type === "organic").length;
  return {
    decision,
    items,
    success: items.length > 0 && decision.outcome !== "indeterminate",
    accountingSuccess: items.length > 0 && decision.outcome === "match",
    error:
      items.length > 0
        ? `DataForSEO returned partial results (${organicCount} organic items); the domain was not found in the retrieved results.`
        : (task.status_message ?? "DataForSEO queued result was unavailable."),
  };
}
