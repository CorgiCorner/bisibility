import "server-only";

import { claimDueRankChecks } from "../rank-check/dispatcher";
import { compensateFailedRankCheckClaims } from "../rank-check/dispatcher-compensation";
import { isRankCheckDispatcherEnabled } from "../rank-check/dispatcher-config";
import { backfillKeywordDispatchStates } from "../rank-check/dispatcher-state";
import type {
  ClaimDueRankChecksResult,
  RankCheckClaimCompensation,
} from "../rank-check/dispatcher-types";

export async function claimDueRankChecksActivity(): Promise<ClaimDueRankChecksResult> {
  if (!isRankCheckDispatcherEnabled()) {
    return {
      claimed: 0,
      claimedAt: new Date().toISOString(),
      groups: [],
      metrics: {
        distinctProjects: 0,
        largestProjectClaim: 0,
        oldestDueLagMsAfter: null,
        oldestDueLagMsBefore: null,
        outcome: "empty_or_skipped_locked",
      },
    };
  }
  return claimDueRankChecks();
}

export async function compensateFailedRankCheckClaimsActivity(input: {
  claims: RankCheckClaimCompensation[];
}) {
  return compensateFailedRankCheckClaims(input);
}

export async function backfillKeywordDispatchStatesActivity(input: {
  cursor: string | null;
  pageSize: number;
}) {
  return backfillKeywordDispatchStates(input);
}
