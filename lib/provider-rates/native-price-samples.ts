import type { Quantity } from "@usagekit/core";
import {
  exactMedianText,
  MAX_PROVIDER_RATE_SAMPLES,
  PROVIDER_RATE_TRAILING_DAYS,
} from "./resolver";

export type NativePriceBinding = {
  namespace: string;
  principal: string;
  projectId: string;
  connectionId: string;
  provider: string;
  providerCredentialVersion: string;
  fundingSource: "byok" | "platform";
};
export type NativePriceSample = NativePriceBinding & {
  operationId: string;
  operation: string;
  options: unknown;
  origin: "native" | "import";
  state: string;
  occurredAt: Date;
  costCents: string | null;
  costCertainty: string;
  cached: boolean;
  failed: boolean;
  chargeReplayed: boolean;
  providerRequestId: string | null;
};

function optionKey(options: unknown): string | null {
  if (!options || typeof options !== "object" || Array.isArray(options)) return null;
  const entries = Object.entries(options);
  if (entries.some(([, value]) => typeof value !== "string")) return null;
  return JSON.stringify(entries.sort(([left], [right]) => left.localeCompare(right)));
}

/** Only exact native call variants can replace a catalog list estimate. Legacy feature
 * averages do not retain request options and cannot prove a price for a new request. */
export function nativeMeasuredPrice(
  binding: NativePriceBinding,
  operation: string,
  options: Readonly<Record<string, string>>,
  samples: readonly NativePriceSample[],
  now: Date,
): { quantity: Quantity; samples: number; basis: "call"; checkedAt: string } | undefined {
  if (binding.fundingSource !== "byok") return undefined;
  const cutoff = now.getTime() - PROVIDER_RATE_TRAILING_DAYS * 86_400_000;
  const target = optionKey(options);
  if (target === null || !Number.isFinite(cutoff)) return undefined;
  const keys = Object.keys(binding) as (keyof NativePriceBinding)[];
  const eligible = samples
    .filter(
      (sample): sample is NativePriceSample & { costCents: string } =>
        keys.every((key) => sample[key] === binding[key]) &&
        sample.operation === operation &&
        optionKey(sample.options) === target &&
        sample.origin === "native" &&
        sample.state === "settled" &&
        sample.costCertainty === "measured" &&
        !sample.cached &&
        !sample.failed &&
        !sample.chargeReplayed &&
        sample.occurredAt.getTime() >= cutoff &&
        sample.occurredAt.getTime() <= now.getTime() &&
        sample.costCents !== null &&
        /^\d+(\.\d{1,4})?$/.test(sample.costCents) &&
        /[1-9]/.test(sample.costCents),
    )
    .sort(
      (left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        left.operationId.localeCompare(right.operationId),
    );
  const operations = new Set<string>();
  const requests = new Set<string>();
  const distinct = eligible
    .filter((sample) => {
      if (
        operations.has(sample.operationId) ||
        (sample.providerRequestId !== null && requests.has(sample.providerRequestId))
      )
        return false;
      operations.add(sample.operationId);
      if (sample.providerRequestId !== null) requests.add(sample.providerRequestId);
      return true;
    })
    .slice(0, MAX_PROVIDER_RATE_SAMPLES);
  const newest = distinct[0];
  if (distinct.length < 5 || !newest) return undefined;
  const text = exactMedianText(distinct.map((sample) => sample.costCents));
  const [whole = "0", fraction = ""] = text.split(".");
  return {
    quantity: { unit: "cents", value: BigInt(whole + fraction), scale: fraction.length },
    samples: distinct.length,
    basis: "call",
    checkedAt: newest.occurredAt.toISOString(),
  };
}
