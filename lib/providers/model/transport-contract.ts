import { paymentDecimalSchema } from "@/lib/action-payment/schema";
import { z } from "zod";

/** Enabled with the persistence migration admitting all three supplemental result keys.
 * Disabled responses carrying those keys settle as transport failures, never as successes.
 */
export const MODEL_RESULT_EXTENSIONS_ENABLED = true;
export const MODEL_CONSULTED_SOURCE_LIMIT = 100;
const reference = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

/** This is provider money, separate from the customer's payment receipt. */
export const modelMoneySchema = z
  .object({
    amount: paymentDecimalSchema.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    certainty: z.enum(["reported", "estimated", "unknown"]),
    basis: z.enum(["provider_response", "original_request_readback", "rate_card", "unknown"]),
    rateCardVersion: reference.nullable(),
  })
  .strict()
  .superRefine((money, ctx) => {
    const unknown = money.certainty === "unknown";
    const estimated = money.certainty === "estimated";
    if (
      unknown !== (money.amount === null) ||
      unknown !== (money.basis === "unknown") ||
      estimated !== (money.basis === "rate_card") ||
      estimated !== (money.rateCardVersion !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Money must retain its amount certainty and provenance.",
      });
  });

export const modelSourceUrlSchema = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Citation URLs cannot contain credentials.");

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
export const modelEvidenceTotalsSchema = z.object({ total: count, omitted: count }).strict();

export function validateModelEvidenceTotals(
  totals: z.infer<typeof modelEvidenceTotalsSchema>,
  retained: number,
  truncated: boolean,
  ctx: z.RefinementCtx,
) {
  if (
    (totals.total !== null &&
      (totals.total < retained || (totals.total > retained && !truncated))) ||
    (totals.omitted !== null && totals.omitted > 0 && !truncated) ||
    (totals.total !== null && totals.omitted !== null && totals.total - retained !== totals.omitted)
  )
    ctx.addIssue({
      code: "custom",
      message: "Source totals must preserve unknowns and flag omissions.",
    });
}

/** Consulted URLs need not occur in the answer. Missing provider totals remain null. */
export const modelConsultedSourcesSchema = modelEvidenceTotalsSchema
  .extend({
    sources: z
      .array(
        z
          .object({
            sourceId: reference,
            url: modelSourceUrlSchema,
            title: z.string().max(512).nullable(),
          })
          .strict(),
      )
      .max(MODEL_CONSULTED_SOURCE_LIMIT),
    truncated: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    validateModelEvidenceTotals(value, value.sources.length, value.truncated, ctx);
    if (value.total !== null && value.truncated !== value.total > value.sources.length)
      ctx.addIssue({ code: "custom", message: "Known source totals must agree with truncation." });
    if (
      new Set(value.sources.map((source) => source.sourceId)).size !== value.sources.length ||
      new Set(value.sources.map((source) => source.url)).size !== value.sources.length
    )
      ctx.addIssue({ code: "custom", message: "Consulted sources must be distinct." });
  });

const component = z.enum([
  "inference",
  "tools",
  "routing",
  "reporting_writes",
  "zero_data_retention",
  "other",
]);
export const modelCostScopeSchema = z
  .object({
    kind: z.enum(["total", "subtotal", "unknown"]),
    includes: z.array(component).max(6),
    excludes: z.array(component).max(6),
    unknown: z.array(component).max(6),
  })
  .strict()
  .superRefine((scope, ctx) => {
    const all = [...scope.includes, ...scope.excludes, ...scope.unknown];
    if (
      new Set(all).size !== all.length ||
      all.length !== component.options.length ||
      (scope.kind === "total" && (scope.excludes.length > 0 || scope.unknown.length > 0))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Cost scope must classify each component once; a total has no exclusions or unknowns.",
      });
  });
const reported = modelMoneySchema.refine(
  (money) => money.certainty === "reported",
  "Reported fields require provider evidence.",
);
const estimated = modelMoneySchema.refine(
  (money) => money.certainty === "estimated",
  "Estimates require rate provenance.",
);

/** Nullable entries mean unreported, never zero. The legacy providerCost stays compatible. */
const costEvidence = z
  .object({
    providerReported: z
      .object({ money: reported, scope: modelCostScopeSchema })
      .strict()
      .nullable(),
    upstreamInference: z
      .object({
        total: reported.nullable(),
        input: reported.nullable(),
        output: reported.nullable(),
      })
      .strict()
      .nullable(),
    localEstimate: estimated.nullable(),
    upstreamInferenceDiscardReason: z.literal("inconsistent").nullable().optional(),
  })
  .strict();

export function validateModelCostEvidenceCurrency(
  evidence: z.infer<typeof costEvidence>,
  ctx: z.RefinementCtx,
  providerCurrency?: string,
) {
  const upstream = evidence.upstreamInference;
  const currencies = new Set(
    [
      evidence.providerReported?.money,
      upstream?.total,
      upstream?.input,
      upstream?.output,
      evidence.localEstimate,
    ].flatMap((money) => (money ? [money.currency] : [])),
  );
  if (providerCurrency !== undefined) currencies.add(providerCurrency);
  if (currencies.size > 1)
    ctx.addIssue({ code: "custom", message: "Cost evidence must use one provider cost currency." });
}

export function decimalExceeds(left: string, right: string) {
  // paymentDecimalSchema admits only unsigned plain decimals with canonical integer digits.
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  if (leftInteger.length !== rightInteger.length) return leftInteger.length > rightInteger.length;
  if (leftInteger !== rightInteger) return leftInteger > rightInteger;
  const scale = Math.max(leftFraction.length, rightFraction.length);
  return leftFraction.padEnd(scale, "0") > rightFraction.padEnd(scale, "0");
}

export const modelCostEvidenceSchema = costEvidence.superRefine((evidence, ctx) => {
  validateModelCostEvidenceCurrency(evidence, ctx);
  const upstream = evidence.upstreamInference;
  if (
    evidence.upstreamInferenceDiscardReason === "inconsistent" &&
    upstream !== null &&
    upstream.total !== null &&
    upstream.input !== null &&
    upstream.output !== null
  )
    ctx.addIssue({
      code: "custom",
      message: "A discard reason requires a dropped inference component.",
    });
  const total = upstream?.total?.amount;
  const input = upstream?.input?.amount;
  const output = upstream?.output?.amount;
  if (
    total != null &&
    [input, output].some((amount) => amount != null && decimalExceeds(amount, total))
  )
    ctx.addIssue({ code: "custom", message: "Inference components cannot exceed their total." });
});

export type ModelConsultedSources = z.infer<typeof modelConsultedSourcesSchema>;
export type ModelEvidenceTotals = z.infer<typeof modelEvidenceTotalsSchema>;
export type ModelCostScope = z.infer<typeof modelCostScopeSchema>;
export type ModelCostEvidence = z.infer<typeof modelCostEvidenceSchema>;

/** Coverage describes the whole request, including failed provider attempts. */
export const MODEL_ROUTING_ATTEMPT_LIMIT = 100;
export const modelRoutingAttemptCredentialsSchema = z
  .object({
    version: z.literal(1),
    completeness: z.enum(["complete", "partial", "unknown"]),
    attempts: z
      .array(
        z
          .object({
            outcome: z.enum(["succeeded", "failed", "unknown"]),
            credentialSource: z.enum(["gateway_system", "customer_upstream", "unknown"]),
          })
          .strict(),
      )
      .max(MODEL_ROUTING_ATTEMPT_LIMIT),
  })
  .strict()
  .refine(
    (value) => value.completeness !== "complete" || value.attempts.length > 0,
    "Complete routing evidence requires at least one attempt.",
  );
export type ModelRoutingAttemptCredentials = z.infer<typeof modelRoutingAttemptCredentialsSchema>;
