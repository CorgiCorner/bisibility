import type {
  ResearchKeywordsAction,
  ResearchKeywordsActionInput,
} from "@/lib/actions/keyword-research";
import { isKeywordResearchEstimate } from "@/lib/keyword-research/types";

export async function loadDeeperEstimate(
  action: ResearchKeywordsAction,
  input: ResearchKeywordsActionInput,
  requestedLimit: 100 | 300 | 500,
) {
  if (requestedLimit >= 500) return undefined;
  try {
    const estimated = await action({
      ...input,
      estimateOnly: true,
      resultLimit: requestedLimit === 100 ? 300 : 500,
    });
    return estimated.ok && isKeywordResearchEstimate(estimated)
      ? { cached: estimated.cached, costCents: estimated.costCents, payment: estimated.payment }
      : undefined;
  } catch {
    return undefined;
  }
}

export async function loadResearchEstimate(
  action: ResearchKeywordsAction,
  input: ResearchKeywordsActionInput,
) {
  try {
    const estimated = await action({ ...input, estimateOnly: true });
    return estimated.ok && isKeywordResearchEstimate(estimated)
      ? {
          cached: estimated.cached,
          costCents: estimated.costCents,
          payments: estimated.payment ? [estimated.payment] : [],
          loading: false,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

export function reviewDeeperResearch(
  tab: import("./research-workspace-model").ResearchTab,
  review: (
    seeds: string[],
    input: Partial<ResearchKeywordsActionInput>,
    scope: import("@/lib/research/scope").ResearchScope,
  ) => Promise<void>,
  setLimit: (limit: 100 | 300 | 500) => void,
) {
  const limit = tab.requestedLimit === 100 ? 300 : 500;
  setLimit(limit);
  return review(
    [tab.seed],
    {
      connectionId: tab.connectionId,
      paymentOptionId: tab.paymentOptionId,
      includeClickstream: tab.includeClickstream,
      mode: tab.mode,
      resultLimit: limit,
    },
    tab.scope,
  );
}
