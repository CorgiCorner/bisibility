import "server-only";

import { cache } from "react";
import { getKeywordMarketTargets } from "./keyword-market-targets";
import { getProjectMarkets } from "./project-markets";

// The parallel header route and detail page share these reads within one request.
export const getKeywordTargetContext = cache(async (projectId: string, keywordId: string) => {
  const [targets, projectMarkets] = await Promise.all([
    getKeywordMarketTargets(projectId, keywordId),
    getProjectMarkets(projectId),
  ]);
  return { projectMarkets, targets };
});
