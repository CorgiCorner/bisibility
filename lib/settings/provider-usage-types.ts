export type ProviderUsageFeature =
  | "backlinks"
  | "domain_overview"
  | "keyword_metrics"
  | "keyword_research"
  | "rank_check"
  | "ranked_keywords";

export type ProviderUsageStat = {
  costCents: number;
  count: number;
  feature: ProviderUsageFeature;
  label: string;
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
    dateFormat: "eu" | "iso" | "long";
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
