import type {
  ActionPaymentOption,
  ActionPaymentQuote,
  ActionPaymentReceipt,
} from "@/lib/action-payment/contract";
import type {
  AnalyzeBacklinksAction,
  AnalyzeBacklinksActionInput,
  LoadMoreBacklinkRowsAction,
} from "@/lib/actions/backlinks";
import type { BacklinkTargetScope } from "@/lib/providers/types";

export type BacklinksLimit = 100 | 300 | 500 | 1000;

export type BacklinksAnalyzeRequest = {
  fallbackOnCostLimit?: boolean;
  fresh?: boolean;
  overrides?: Omit<Partial<AnalyzeBacklinksActionInput>, "target">;
  target?: string;
};

export type BacklinksEstimateView = {
  payment?: ActionPaymentQuote;
  paymentOptions?: ActionPaymentOption[];
  cached: boolean;
  costCents: number | null;
  loading: boolean;
  valid: boolean;
};

export type RecentBacklinksTarget = {
  payment?: ActionPaymentReceipt;
  originalPayment?: ActionPaymentReceipt;
  cachedUntil: string;
  fetchedAt: string;
  includeSubdomains: boolean;
  provider?: string;
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
  providerStatus: "connected" | "needs_reauth" | "no_provider";
  supportingProviders?: string[];
  providers?: { label: string; value: string }[];
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
    target.provider ?? "unknown",
    target.includeSubdomains ? "subdomains" : "no-subdomains",
  ].join(":");
}

export function scopeLabel(scope: BacklinkTargetScope) {
  return scope === "site" ? "whole site" : "exact page";
}
