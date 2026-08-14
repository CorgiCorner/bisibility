import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type {
  AnalyzeDomainOverviewAction,
  LoadDomainHistoryAction,
  LoadDomainKeywordsPageAction,
  LoadDomainPagesPageAction,
  SaveSelectedKeywordsAction,
  SelectDomainOverviewMarketAction,
} from "@/lib/actions/domain-overview";
import type { DomainOverviewMarketOption } from "@/lib/domain-overview/market-options";
import type {
  DomainOverviewOutcome,
  DomainOverviewReport,
  DomainOverviewScope,
  DomainRecentTarget,
} from "@/lib/domain-overview/types";
import { normalizeDomain } from "@/lib/domains/normalize";
import { getDomain } from "tldts";

export type DomainOverviewMarketSelection = LocationFieldValue & {
  languageCode: string;
  languageLabel: string;
  locationCode: number | null;
};

export type DomainOverviewMarketView = DomainOverviewMarketSelection & { locationCode: number };

export type DomainOverviewPageContext = {
  catalogMarkets: DomainOverviewMarketOption[];
  competitorDomains: string[];
  costContext: { capCents: number; spentCents: number; timezone?: string };
  defaultTarget: string;
  providerStatus: "connected" | "needs_reauth" | "no_provider";
  recentTargets: DomainRecentTarget[];
  trackedMarkets: DomainOverviewMarketOption[];
};

export type DomainOverviewEstimateView = {
  cached: boolean;
  costCents: number | null;
  freshCostCents: number | null;
  historyCostCents: number | null;
  keywordPageCostCents: number | null;
  loading: boolean;
  pagePageCostCents: number | null;
  valid: boolean;
};

export type DomainOverviewUiState =
  | "budget_exhausted"
  | "empty"
  | "idle"
  | "in_progress"
  | "loading"
  | "lookup_failed"
  | "needs_reauth"
  | "no_data"
  | "no_provider"
  | "partial"
  | "rate_limited"
  | "cost_limit_exceeded"
  | "snapshot_expired"
  | "unsupported_location";

export type DomainOverviewTransportFailure = {
  charged: null;
  ok: false;
  reason: "lookup_failed";
};

export type DomainOverviewUiOutcome = DomainOverviewOutcome | DomainOverviewTransportFailure;

export type DomainOverviewWorkspaceProps = {
  analyzeAction: AnalyzeDomainOverviewAction;
  context: DomainOverviewPageContext;
  initialEstimate: DomainOverviewEstimateView;
  initialOutcome: DomainOverviewOutcome | null;
  initialScope?: DomainOverviewScope;
  initialTarget?: string;
  loadHistoryAction: LoadDomainHistoryAction;
  loadKeywordsPageAction: LoadDomainKeywordsPageAction;
  loadPagesPageAction: LoadDomainPagesPageAction;
  market: DomainOverviewMarketSelection | null;
  projectId: string;
  projectRef: string;
  selectMarketAction: SelectDomainOverviewMarketAction;
  saveSelectedKeywordsAction?: SaveSelectedKeywordsAction;
};

export const EMPTY_DOMAIN_OVERVIEW_ESTIMATE: DomainOverviewEstimateView = {
  cached: false,
  costCents: null,
  freshCostCents: null,
  historyCostCents: null,
  keywordPageCostCents: null,
  loading: false,
  pagePageCostCents: null,
  valid: false,
};

export function estimateView(outcome: DomainOverviewOutcome | null): DomainOverviewEstimateView {
  if (!outcome?.ok || !("estimate" in outcome)) return EMPTY_DOMAIN_OVERVIEW_ESTIMATE;
  return {
    cached: outcome.cached,
    costCents: outcome.estimatedCostCents,
    freshCostCents: outcome.freshEstimatedCostCents,
    historyCostCents: outcome.historyEstimatedCostCents,
    keywordPageCostCents: outcome.keywordPageEstimatedCostCents,
    loading: false,
    pagePageCostCents: outcome.pagePageEstimatedCostCents,
    valid: true,
  };
}

export function reportFrom(outcome: DomainOverviewUiOutcome | null): DomainOverviewReport | null {
  return outcome?.ok && !("estimate" in outcome) ? outcome : null;
}

export function domainOverviewReportIdentity(report: DomainOverviewReport | null) {
  if (!report) return "";
  return JSON.stringify([
    report.provider,
    report.target,
    report.scope,
    report.locationCode,
    report.languageCode,
    report.fetchedAt,
    report.sourceSnapshotAt,
  ]);
}

export function detectedDomainScope(value: string): DomainOverviewScope | null {
  const hostname = normalizeDomain(value);
  const registrable = hostname ? getDomain(hostname, { allowPrivateDomains: false }) : null;
  if (!hostname || !registrable) return null;
  return hostname === registrable ? "root" : "subdomain";
}

export function failureState(
  outcome: DomainOverviewUiOutcome | null,
): DomainOverviewUiState | null {
  if (!outcome || outcome.ok) return null;
  if (outcome.reason === "budget_exhausted") return "budget_exhausted";
  if (outcome.reason === "needs_reauth") return "needs_reauth";
  if (outcome.reason === "no_source") return "no_provider";
  if (outcome.reason === "unsupported_location") return "unsupported_location";
  if (outcome.reason === "in_progress") return "in_progress";
  if (outcome.reason === "rate_limited") return "rate_limited";
  if (outcome.reason === "cost_limit_exceeded") return "cost_limit_exceeded";
  if (outcome.reason === "snapshot_expired") return "snapshot_expired";
  return "lookup_failed";
}

export function failureCharge(outcome: DomainOverviewUiOutcome | null): boolean | null {
  if (!outcome || outcome.ok) return null;
  return "charged" in outcome ? outcome.charged : outcome.costCents > 0;
}

export function failureResetAt(outcome: DomainOverviewUiOutcome | null) {
  return outcome && !outcome.ok && "resetAt" in outcome ? outcome.resetAt : undefined;
}

export function marketLabel(market: DomainOverviewMarketSelection) {
  return `${market.displayName}, ${market.languageLabel}`;
}

export function supportedMarket(
  market: DomainOverviewMarketSelection | null,
): DomainOverviewMarketView | null {
  return market?.locationCode == null ? null : { ...market, locationCode: market.locationCode };
}

export function reportUrl(input: {
  market: DomainOverviewMarketView;
  projectRef: string;
  scope?: DomainOverviewScope;
  target: string;
}) {
  const params = new URLSearchParams({
    domain: input.target,
    market: input.market.canonicalKey,
  });
  if (input.scope) params.set("scope", input.scope);
  return `/app/${encodeURIComponent(input.projectRef)}/domain-overview?${params.toString()}`;
}

export function estimateInput(input: {
  market: DomainOverviewMarketView;
  projectId: string;
  scopeOverride?: DomainOverviewScope;
  target: string;
}) {
  return {
    estimateOnly: true,
    fresh: false,
    languageCode: input.market.languageCode,
    locationCode: input.market.locationCode,
    projectId: input.projectId,
    scopeOverride: input.scopeOverride,
    target: input.target,
  };
}

export function cacheHoursRemaining(cachedUntil: string, now = new Date()) {
  return Math.max(0, Math.ceil((new Date(cachedUntil).getTime() - now.getTime()) / 3_600_000));
}
