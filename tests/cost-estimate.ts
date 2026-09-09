import type { CostEstimateState } from "@/components/cost-estimate/useCostEstimate";
import {
  type CostEstimateInput,
  costEstimateHref,
  costEstimateQuerySchema,
} from "@/lib/cost-estimate/api-contract";
import { estimateForQuery } from "@/lib/cost-estimate/api-estimate";
import { rateForProvider } from "@/lib/cost-estimate/provider-rates";

// View fixtures use the endpoint's service; transport behavior has its own tests.
export function costEstimateFixture(input: CostEstimateInput, enabled = true): CostEstimateState {
  const url = enabled ? costEstimateHref(input) : null;
  if (!url) return { status: "loading", data: null, retry() {} };
  const query = costEstimateQuerySchema.parse(
    Object.fromEntries(new URL(url, "http://example.test").searchParams),
  );
  const rate = rateForProvider(query.provider);
  if (!rate) return { status: "error", data: null, retry() {} };
  return { status: "ready", data: estimateForQuery(query, rate), retry() {} };
}

export { costEstimateFixture as useCostEstimate };
