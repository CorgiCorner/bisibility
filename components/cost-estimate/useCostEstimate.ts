"use client";

import { type CostEstimateInput, costEstimateHref } from "@/lib/cost-estimate/api-contract";
import { useMemo, useSyncExternalStore } from "react";
import { type CostEstimateSnapshot, createCostEstimateStore } from "./cost-estimate-store";

export type CostEstimateState = CostEstimateSnapshot & { retry: () => void };

export function useCostEstimate(input: CostEstimateInput, enabled = true): CostEstimateState {
  const url = enabled ? costEstimateHref(input) : null;
  const store = useMemo(() => createCostEstimateStore(url), [url]);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { ...snapshot, retry: store.retry };
}
