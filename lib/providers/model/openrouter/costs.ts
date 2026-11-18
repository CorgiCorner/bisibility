import { paymentDecimalSchema } from "@/lib/action-payment/schema";
import type { ModelCostEvidence, ModelCostScope, ModelMoney } from "@/lib/model-playground/types";
import { decimalExceeds, modelCostEvidenceSchema } from "@/lib/providers/model/transport-contract";
import type { ModelJsonOptions } from "@/lib/providers/model/transport-json";

export const COST_JSON_OPTIONS: ModelJsonOptions = {
  moneyPaths: [
    ["usage", "cost"],
    ["usage", "cost_details", "upstream_inference_cost"],
    ["usage", "cost_details", "upstream_inference_prompt_cost"],
    ["usage", "cost_details", "upstream_inference_completions_cost"],
  ],
};

function unknownMoney(): ModelMoney {
  return {
    amount: null,
    currency: "USD",
    certainty: "unknown",
    basis: "unknown",
    rateCardVersion: null,
  };
}

/** Only exact strings from the lossless transport or synthetic fixtures are admissible. */
function reportedMoney(value: unknown): ModelMoney | null {
  const parsed = paymentDecimalSchema.safeParse(value);
  return parsed.success
    ? {
        amount: parsed.data,
        currency: "USD",
        certainty: "reported",
        basis: "provider_response",
        rateCardVersion: null,
      }
    : null;
}

function exceeds(left: string | null | undefined, right: string | null | undefined): boolean {
  if (left == null || right == null) return false;
  return decimalExceeds(left, right);
}

/** Comparison-only sum; never emitted as reported money. */
function sumComponents(left: string | null | undefined, right: string | null | undefined) {
  if (left == null || right == null) return null;
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const sum = (
    BigInt(leftInteger + leftFraction.padEnd(scale, "0")) +
    BigInt(rightInteger + rightFraction.padEnd(scale, "0"))
  )
    .toString()
    .padStart(scale + 1, "0");
  return scale ? `${sum.slice(0, -scale)}.${sum.slice(-scale)}` : sum;
}

function scope(search: boolean, isByok: unknown, contradicted: boolean): ModelCostScope {
  // Only explicit non-BYOK establishes inference coverage; web fees remain unverified.
  const inferenceKnown = isByok === false && !contradicted;
  if (!search && inferenceKnown)
    return {
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
    };
  return {
    kind: "subtotal",
    includes: inferenceKnown ? ["inference"] : [],
    excludes: isByok === true ? ["inference"] : [],
    unknown: [
      ...(isByok !== true && !inferenceKnown ? ["inference" as const] : []),
      "tools",
      "routing",
      "reporting_writes",
      "zero_data_retention",
      "other",
    ],
  };
}

export function normalizeCosts(
  raw: Record<string, unknown>,
  details: Record<string, unknown>,
  search: boolean,
) {
  const money = reportedMoney(raw.cost);
  const total = reportedMoney(details.upstream_inference_cost);
  const input = reportedMoney(details.upstream_inference_prompt_cost);
  const output = reportedMoney(details.upstream_inference_completions_cost);
  // Assess every reported amount before dropping any inconsistent component.
  const contradicted = [
    total?.amount,
    input?.amount,
    output?.amount,
    sumComponents(input?.amount, output?.amount),
  ].some((amount) => exceeds(amount, money?.amount));
  const evidence: ModelCostEvidence = {
    providerReported: money ? { money, scope: scope(search, raw.is_byok, contradicted) } : null,
    upstreamInference: total || input || output ? { total, input, output } : null,
    localEstimate: null,
  };
  let parsed = modelCostEvidenceSchema.safeParse(evidence);
  // Keep the total and each consistent component independently.
  if (!parsed.success)
    parsed = modelCostEvidenceSchema.safeParse({
      ...evidence,
      upstreamInferenceDiscardReason: "inconsistent",
      upstreamInference: {
        total,
        input: exceeds(input?.amount, total?.amount) ? null : input,
        output: exceeds(output?.amount, total?.amount) ? null : output,
      },
    });
  // Optional upstream evidence cannot invalidate an independently valid account charge.
  if (!parsed.success)
    parsed = modelCostEvidenceSchema.safeParse({
      ...evidence,
      upstreamInference: null,
      upstreamInferenceDiscardReason: "inconsistent",
    });
  return {
    providerCost:
      parsed.success && parsed.data.providerReported?.scope.kind === "total" && money
        ? money
        : unknownMoney(),
    costEvidence: parsed.success
      ? parsed.data
      : {
          providerReported: null,
          upstreamInference: null,
          localEstimate: null,
        },
  };
}
