import { modelUsageDigest, validateModelUsageReceipt } from "@/lib/model-playground/usage";
import {
  type ModelNativeUsageReceipt,
  modelUsageDimensions,
} from "@/lib/model-playground/usage-contract";
import type { LoadedModelUsageEvidence } from "@/lib/model-playground/usage-storage";
import { shiftUsageDecimal } from "@/lib/model-playground/usage-valuation";
import type { Measurement, Receipt } from "@usagekit/core";
import { decimalQuantity } from "./mapping";

const units = {
  inputTokens: "input_tokens",
  outputTokens: "output_tokens",
  cacheReadInputTokens: "cache_read_input_tokens",
  cacheWriteInputTokens: "cache_write_input_tokens",
  reasoningTokens: "reasoning_tokens",
  searchCalls: "search_calls",
  searchContentTokens: "search_content_tokens",
} as const;

function quantity(value: string, unit: string) {
  const scale = value.split(".")[1]?.length ?? 0;
  if (scale > 18) throw new Error("Native quantity exceeds Meter precision.");
  return decimalQuantity(value, unit, scale);
}

/** Measured native quantities only; advisory valuation has a separate entry point. */
export function modelUsageMeasurements(value: ModelNativeUsageReceipt): Measurement[] {
  const receipt = validateModelUsageReceipt(value, value.binding);
  const usage = receipt.evidence?.usage;
  const measurements: Measurement[] = [];
  for (const dimension of modelUsageDimensions) {
    const count = usage?.[dimension] ?? null;
    const unit = units[dimension];
    if (count !== null)
      measurements.push({ unit, certainty: "measured", quantity: quantity(String(count), unit) });
    else if (receipt.binding.policy.billableDimensions.includes(dimension))
      measurements.push({ unit, certainty: "unknown", quantity: null });
  }
  for (const ttl of receipt.binding.policy.cacheWriteTtls) {
    const count = usage?.cacheWrites.find((write) => write.ttlSeconds === ttl)?.tokens ?? null;
    const unit = `cache_write_input_tokens_${ttl}s`;
    measurements.push(
      count === null
        ? { unit, certainty: "unknown", quantity: null }
        : { unit, certainty: "measured", quantity: quantity(String(count), unit) },
    );
  }
  return measurements;
}

/** These estimates must never be attached to a confirmed monetary receipt. */
export function modelUsageAdvisoryMeasurements(value: ModelNativeUsageReceipt): Measurement[] {
  const receipt = validateModelUsageReceipt(value, value.binding);
  const cents = receipt.budgetValuation.cents;
  return cents === null
    ? []
    : [
        {
          unit: "budget_cents",
          certainty: "estimated",
          quantity: quantity(cents, "budget_cents"),
        },
      ];
}

/** Until the companion can close usage independently, only a complete monetary total may settle. */
export function modelUsageMeterReceipt(value: LoadedModelUsageEvidence, now: Date): Receipt {
  if (value.counted !== true || value.canonicalId !== null)
    throw new Error("Duplicate native request cannot settle again.");
  if (!value.receipt) throw new Error("Native usage binding is unavailable.");
  const receipt = validateModelUsageReceipt(value.receipt, value.receipt.binding);
  const money = receipt.monetary.total;
  const evidence = receipt.evidence;
  if (money && money.certainty !== "reported")
    throw new Error("Only provider-reported totals may settle native money.");
  if (
    receipt.usageStatus !== "complete" ||
    receipt.additionalExposure === "unknown" ||
    !money ||
    money.currency !== "USD" ||
    money.amount === null ||
    evidence === null
  )
    throw new Error("Meter companion required for native usage settlement independent of money.");
  const cents = shiftUsageDecimal(money.amount, 2);
  const exact = decimalQuantity(cents, "cents", 4);
  return {
    id: modelUsageDigest(
      evidence.providerRequestId
        ? {
            connectionId: receipt.binding.connectionId,
            providerRequestId: evidence.providerRequestId,
          }
        : { connectionId: receipt.binding.connectionId, attemptId: receipt.binding.attemptId },
    ),
    evidenceRef: receipt.binding.attemptId,
    source: "dispatch",
    measurements: [
      ...modelUsageMeasurements(receipt),
      { unit: "cents", certainty: "measured", quantity: exact },
    ],
    cost: { certainty: "measured", money: { units: exact.value, currency: "USD" } },
    occurredAt: evidence.occurredAt,
    recordedAt: now.toISOString(),
    cached: false,
    failed: evidence.failed,
    ...(evidence.providerRequestId ? { providerRequestId: evidence.providerRequestId } : {}),
  };
}
