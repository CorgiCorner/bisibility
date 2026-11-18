import type { NativeRequestGuard, PaidFenceHook } from "@/lib/metering/paid-attempt-types";
import type { RequestCostLimit } from "./request-cost-limit";
import type { ProviderRequestAttribution } from "./tag";

export type ProviderRequestJournalInput = {
  logicalOperationKey?: string;
  beforeReserve?: NativeRequestGuard;
  beforeFence?: PaidFenceHook;
  attribution: ProviderRequestAttribution;
  connectionId: string;
  keywordId?: string;
  projectId: string;
  provider: string;
  unit: "cents" | "units";
  estimate?: { cents: string; units: string };
  queued?: boolean;
  credentialVersion?: string | null;
  maxCostCents?: number;
  costLimit?: RequestCostLimit;
};
