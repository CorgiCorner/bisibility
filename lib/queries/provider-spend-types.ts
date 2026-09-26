import type { ProviderUsageFreshness } from "@/lib/provider-usage/usage-freshness";
import type { ProviderStatus } from "@/lib/providers/types";
import type { ProviderAvailabilityData, ProviderUsageStat } from "@/lib/settings/options";
import type { SurfaceSpend } from "./provider-spend-surfaces";

/** `own` = the project's own provider keys; `credits` = paid from the credit wallet. */
export type ProviderSpendSource = "own" | "credits";

/**
 * One paying source of a connection: its own budgets, usage and spend. Own keys
 * are measured in the provider catalog unit (provider charges); credits are
 * always cents of credits spent. The two are never added together.
 */
export type ProviderSpendSourceBlock = {
  /** Requests this month, both surfaces. */
  requestCount: number;
  surfaces: { app: SurfaceSpend; programmatic: SurfaceSpend };
  unconfirmedCount: number;
  unit: "cents" | "units";
  /** Confirmed usage this month, both surfaces. */
  used: number;
  /** Confirmed usage last month, both surfaces. */
  usedPriorMonth: number;
};

/**
 * The top-level allocation, surfaces and usage fields describe the source the
 * connection runs on today (`credentialSource`). `own` and `credits` carry both
 * sources side by side, including the inactive one.
 */
export type ProviderSpendConnection = {
  allocation: { amountPerMonth: number; unit: "cents" | "units" } | null;
  allocationSource: "connection" | "legacy_project" | "none";
  /** Provider-side balance; only for connections on the project's own keys. */
  availableAtProvider?: ProviderAvailabilityData;
  billing: "metered" | "quota";
  connectionId: string;
  credentialSource: "own" | "hosted";
  credits: ProviderSpendSourceBlock;
  own: ProviderSpendSourceBlock;
  enabled: boolean;
  features: ProviderUsageStat[];
  primary: boolean;
  programmaticAllocation: { amountPerMonth: number; unit: "cents" | "units" } | null;
  projectedExhaustionAt: string | null;
  provider: string;
  providerId: string;
  quotaReset: "billing_cycle" | "calendar_month" | "none";
  remaining: number | null;
  requestCount: number;
  reconciliation?: ProviderUsageFreshness;
  /** Requests whose measurement has not settled; `used` is a confirmed partial then. */
  unconfirmedCount: number;
  state: "ok" | "capped" | "fallback_active" | "top_up_required" | "no_allocation";
  status: ProviderStatus;
  surfaces: { app: SurfaceSpend; programmatic: SurfaceSpend };
  unit: "cents" | "units";
  used: number;
  usedPercent: number | null;
  usedPriorMonth: number;
};

export type ProviderSpendSummary = {
  attention: ProviderSpendConnection["connectionId"][];
  maxUsedPercent: number | null;
  period: { daysUntilReset: number; endsAt: string; monthLabel: string; startsAt: string };
  projected:
    | { kind: "within_limits" }
    | { at: string; kind: "cap_by"; provider: string }
    | { kind: "no_usage" };
  /**
   * Confirmed spend this month, split by who was paid: `cents` is what providers
   * charged on the project's own keys, `creditsCents` is credits spent, `units`
   * is native quota usage on own keys.
   */
  recorded: { cents: number; creditsCents: number; units: number };
  requestCount: number;
  /** Tightest budget among the sources connections run on today. */
  tightest: {
    connectionId: string;
    provider: string;
    source: ProviderSpendSource;
    surface: "app" | "programmatic";
    usedPercent: number;
  } | null;
};

export type ProjectProviderSpend = {
  connections: ProviderSpendConnection[];
  summary: ProviderSpendSummary;
};
