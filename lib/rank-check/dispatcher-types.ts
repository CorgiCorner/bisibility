export type ClaimedRankCheckGroup = {
  claims: RankCheckClaimCompensation[];
  device: string;
  domain: string;
  keywordIds: string[];
  locationId: string;
  projectId: string;
};

export type RankCheckClaimCompensation = {
  advancedCheckAt: string;
  dueCheckAt: string;
  keywordId: string;
  stateVersion: string;
};

export type ClaimDueRankChecksMetrics = {
  distinctProjects: number;
  largestProjectClaim: number;
  oldestDueLagMsAfter: number | null;
  oldestDueLagMsBefore: number | null;
  outcome: "claimed" | "empty_or_skipped_locked";
};

export type ClaimDueRankChecksResult = {
  claimed: number;
  claimedAt: string;
  groups: ClaimedRankCheckGroup[];
  metrics: ClaimDueRankChecksMetrics;
};
