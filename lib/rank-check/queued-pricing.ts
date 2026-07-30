import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import type { SerpDepth } from "@/lib/serp/markets";
import type { DataForSeoQueuePriority } from "./queued-config";

const COST_PER_PAGE_CENTS = {
  high: 0.12,
  normal: 0.06,
} as const;

export function queuedBillingUnits(depth: SerpDepth) {
  return pagesPerCheck(depth);
}

export function dataForSeoQueuedEstimate(priority: DataForSeoQueuePriority, depth: SerpDepth) {
  return Number((COST_PER_PAGE_CENTS[priority] * queuedBillingUnits(depth)).toFixed(4));
}
