import type { AnalyzeBacklinksAction, LoadMoreBacklinkRowsAction } from "@/lib/actions/backlinks";
import type { BacklinkTargetScope } from "@/lib/providers/types";

export type BacklinksLimit = 100 | 300 | 500 | 1000;

export type BacklinksEstimateView = {
  cached: boolean;
  costCents: number | null;
  loading: boolean;
  valid: boolean;
};

export type RecentBacklinksTarget = {
  cachedUntil: string;
  fetchedAt: string;
  includeSubdomains: boolean;
  resultLimit: BacklinksLimit;
  target: string;
  targetScope: BacklinkTargetScope;
};

type BacklinksWorkspaceContext = {
  costContext: {
    capCents: number;
    spentCents: number;
  };
  defaultTarget: string;
  recentTargets: RecentBacklinksTarget[];
};

export type BacklinksWorkspaceProps = {
  analyzeAction: AnalyzeBacklinksAction;
  context: BacklinksWorkspaceContext;
  initialEstimate?: BacklinksEstimateView;
  initialTarget?: string;
  loadMoreAction: LoadMoreBacklinkRowsAction;
  projectId: string;
};

export const EMPTY_BACKLINKS_ESTIMATE: BacklinksEstimateView = {
  cached: false,
  costCents: null,
  loading: false,
  valid: false,
};

export function recentTargetKey(target: RecentBacklinksTarget) {
  return [
    target.target,
    target.targetScope,
    target.includeSubdomains ? "subdomains" : "no-subdomains",
  ].join(":");
}

export function scopeLabel(scope: BacklinkTargetScope) {
  return scope === "site" ? "whole site" : "exact page";
}
