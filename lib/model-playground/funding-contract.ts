import type { Authority, Operation, Receipt } from "@usagekit/core";
import type { ModelAttempt } from "./admission-storage";
import type { ModelInterruption } from "./interruption";
import type { ModelPaymentContext } from "./payment";
import type { ModelColumnResult } from "./types";
import type { ModelUsageBinding } from "./usage-contract";
import type { LoadedModelUsageEvidence } from "./usage-storage";

export type ModelFundingValuation = Pick<
  ModelPaymentContext["columns"][number],
  "forecast" | "advisory"
> &
  Pick<ModelUsageBinding, "policy" | "rateCard"> & {
    platform: NonNullable<ModelUsageBinding["platform"]>;
  };

export type ModelFundingSettlementInput = {
  attempt: ModelAttempt;
  loaded: LoadedModelUsageEvidence;
  operation: Operation;
  receipt: Receipt;
  authority: Authority;
  now: Date;
  response?: ModelColumnResult | null;
  interruption?: ModelInterruption;
};

export type ModelFundingSettlement =
  | { kind: "settled"; operation: Operation }
  | { kind: "pending"; reason: "usage_incomplete" | "price_unavailable" | "cost_conflict" };
