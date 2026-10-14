import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import type { ProviderHistoryWindow } from "./history-window";

export type BacklinkTargetScope = "site" | "page";
export type BacklinkRowMode = "as_is" | "one_per_domain";
export type BacklinkFlag = "nofollow" | "ugc" | "sponsored" | "image" | "sitewide";

export type BacklinkSummary = {
  backlinksTotal: number;
  brokenBacklinks: number;
  brokenPages: number;
  dofollowPct: number;
  domainRank: number;
  lostBacklinks: number;
  lostReferringDomains: number;
  newBacklinks: number;
  newReferringDomains: number;
  referringDomainsTotal: number;
  referringPages: number;
  spamScore: number;
};

type BacklinkHistoryRow = {
  lostLinks: number;
  lostReferringDomains: number;
  month: string;
  newLinks: number;
  newReferringDomains: number;
};

export type BacklinkRow = {
  anchor: string;
  domainAuthority: number;
  firstSeen: string | null;
  flags: BacklinkFlag[];
  linksCount: number;
  lostAt: string | null;
  sourceDomain: string;
  sourceUrl: string;
  spamScore: number;
  status: "active" | "new" | "lost";
  targetUrl: string;
};

export type BacklinkTargetInput = {
  attribution?: ProviderRequestAttribution;
  includeSubdomains: boolean;
  tag?: string;
  target: string;
  targetScope: BacklinkTargetScope;
};

export type BacklinkHistoryInput = BacklinkTargetInput & { historyWindow?: ProviderHistoryWindow };

export type BacklinkSummaryResult = { costCents: number; summary: BacklinkSummary };
export type BacklinkHistoryResult = { costCents: number; rows: BacklinkHistoryRow[] };
export type BacklinkRowsResult = {
  costCents: number;
  rows: BacklinkRow[];
  totalCount: number;
};
