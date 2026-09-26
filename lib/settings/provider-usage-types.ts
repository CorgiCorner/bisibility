import type { DateFormatPreference } from "@/lib/dates/format";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";

export type ProviderUsageFeature =
  | "backlinks"
  | "domain_overview"
  | "keyword_metrics"
  | "keyword_research"
  | "rank_check"
  | "ranked_keywords";

export type ProviderUsageStatSource = {
  count: number;
  costCents: number;
  scheduled: number;
  source: ProviderRequestSource | "unknown";
};

export type ProviderUsageStat = {
  bySource: ProviderUsageStatSource[];
  costCents: number;
  count: number;
  feature: ProviderUsageFeature;
  label: string;
  /** Logical rank checks completed this month; kept separate from ledger usage. */
  checksCount?: number;
  /** Confirmed native quantity (searches) for quota features; null when unmeasured. */
  quantity?: number | null;
  /** Requests whose measurement has not settled yet; confirmed totals are partial then. */
  unconfirmedCount?: number;
};

export type ProviderAvailabilityData =
  | {
      amount: number;
      checkedAt: string;
      status: "available";
      total?: number;
      unit: "searches" | "usd";
    }
  | { checkedAt: string; status: "unreachable" }
  | { status: "reconnect_required" };

export type ProviderConnectionUsageData = {
  availableAtProvider?: ProviderAvailabilityData | null;
  connectionId: string;
  costPerCheck: string;
  features: readonly ProviderUsageStat[];
  primary: boolean;
  provider: string;
  providerId: string;
};

export type ProviderUsageData = {
  budget: { capCents: number; spentCents: number };
  period: {
    dateFormat: DateFormatPreference;
    endAt: string;
    endLabel: string;
    label: string;
    now: string;
    resetsLabel: string;
    timezone: string;
  };
  connections: readonly ProviderConnectionUsageData[];
  serpChecksMonth: string;
  primaryProvider: string;
  hasProvider: boolean;
  onPaceCents: number | null;
};
