import "server-only";

import { getProjectCostContext } from "@/lib/queries/cost-calculator";

export function loadRankTrackerCostContext(projectRef: string) {
  return getProjectCostContext(projectRef);
}
