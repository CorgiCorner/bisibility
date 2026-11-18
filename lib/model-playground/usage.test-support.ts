import type { ModelCostEvidence } from "@/lib/providers/model/transport-contract";
import { digest, input, result, unknownUsage } from "./contract-fixtures.test-support";
import type { ModelColumnResult } from "./types";
import type { ModelUsageBinding } from "./usage-contract";

export function binding(): ModelUsageBinding {
  return {
    version: 1,
    feature: "model_playground",
    fundingSource: "byok",
    source: "app",
    attemptId: "attempt-1",
    projectId: "project-example",
    principal: "owner-example",
    connectionId: "internal-connection",
    credentialVersion: digest,
    accountDigest: digest,
    configHash: digest,
    capabilityVersion: "capability-v1",
    column: input().columns[0],
    policy: {
      billableDimensions: [
        "inputTokens",
        "outputTokens",
        "cacheReadInputTokens",
        "cacheWriteInputTokens",
      ],
      cacheWriteTtls: [],
      inputCacheAccounting: "included",
      searchContentAccounting: "included",
    },
    rateCard: null,
  };
}

export function measuredResult(): ModelColumnResult {
  return {
    ...result(),
    usage: {
      ...unknownUsage,
      completeness: "complete" as const,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadInputTokens: 10,
      cacheWriteInputTokens: 0,
      reasoningTokens: 5,
      inputCacheAccounting: "included" as const,
    },
  };
}

export function pricedBinding(): ModelUsageBinding & {
  rateCard: NonNullable<ModelUsageBinding["rateCard"]>;
} {
  return {
    ...binding(),
    rateCard: {
      version: "rates-v1",
      currency: "USD",
      scope: {
        kind: "total",
        includes: [
          "inference",
          "tools",
          "routing",
          "reporting_writes",
          "zero_data_retention",
          "other",
        ],
        excludes: [],
        unknown: [],
      },
      rates: [
        { dimension: "inputTokens", usdPerUnit: "0.000001" },
        { dimension: "outputTokens", usdPerUnit: "0.000002" },
        { dimension: "cacheReadInputTokens", usdPerUnit: "0.0000001" },
        { dimension: "cacheWriteInputTokens", usdPerUnit: "0.000003" },
      ],
    },
  } satisfies ModelUsageBinding;
}

export function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test evidence");
  return value;
}

export function reportedResult(
  amount = "0.00012345",
): ModelColumnResult & { costEvidence: ModelCostEvidence } {
  const value = measuredResult();
  const money = {
    amount,
    currency: "USD",
    certainty: "reported" as const,
    basis: "provider_response" as const,
    rateCardVersion: null,
  };
  return {
    ...value,
    providerCost: money,
    costEvidence: {
      providerReported: { money, scope: pricedBinding().rateCard.scope },
      upstreamInference: null,
      localEstimate: null,
    },
  };
}
