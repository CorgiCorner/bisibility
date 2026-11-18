import { boundedJson } from "@/lib/agent-reports/json-budget";
import type { PlaygroundEntity } from "@/lib/ai-research/model-playground-view";
import type { HistoryCost } from "@/lib/research-history/contract";
import { z } from "zod";
import { projectColumnResult, type ResultColumn } from "./result-view";
import { MODEL_PLAYGROUND_LIMITS, modelColumnSchema, modelPlaygroundDraftSchema } from "./schema";
import { type ModelColumnResult, modelColumnResultSchema } from "./types";

const entitySchema = z
  .object({
    id: z.string(),
    label: z.string(),
    kind: z.enum(["project", "competitor"]),
    domain: z.string().nullable(),
    aliases: z.array(z.string()),
    excludedNames: z.array(z.string()),
  })
  .strict();
const {
  paymentReceipt: _receipt,
  rawEvidenceId: _evidence,
  routingAttemptCredentials: _credentials,
  ...resultShape
} = modelColumnResultSchema.shape;
const reportResultSchema = z
  .object(resultShape)
  .strict()
  .superRefine((value, ctx) => {
    if (
      !modelColumnResultSchema.safeParse({ ...value, paymentReceipt: null, rawEvidenceId: null })
        .success
    )
      ctx.addIssue({ code: "custom", message: "Invalid retained result." });
  });
const unobservedSchema = z
  .object({ column: modelColumnSchema, state: z.literal("unknown"), answer: z.null() })
  .strict();

export const modelPlaygroundReportSchema = z
  .object({
    format: z.literal("model_playground"),
    version: z.literal(1),
    runId: z.uuid(),
    provenance: z.literal("api_response"),
    input: modelPlaygroundDraftSchema,
    results: z
      .array(z.union([reportResultSchema, unobservedSchema]))
      .min(1)
      .max(MODEL_PLAYGROUND_LIMITS.columns),
    entities: z.array(entitySchema).max(1000),
    brandsCapturedAt: z.iso.datetime().optional(),
    brandsBasis: z.literal("save_time").optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (
      body.results.length !== body.input.columns.length ||
      body.results.some(
        (result, i) => JSON.stringify(result.column) !== JSON.stringify(body.input.columns[i]),
      )
    )
      ctx.addIssue({ code: "custom", message: "Results must match every ordered input column." });
    if (!boundedJson(body, MODEL_PLAYGROUND_LIMITS.reportBytes))
      ctx.addIssue({ code: "custom", message: "Report exceeds the retained body budget." });
  });
export type ModelPlaygroundReport = z.infer<typeof modelPlaygroundReportSchema>;

export class ModelPlaygroundReportBudgetError extends Error {}

export function buildModelPlaygroundReport(
  runId: string,
  input: ModelPlaygroundReport["input"],
  results: readonly (ModelColumnResult | z.infer<typeof unobservedSchema>)[],
  entities: readonly PlaygroundEntity[],
  brandsCapturedAt: string = new Date().toISOString(),
): ModelPlaygroundReport {
  const body = {
    format: "model_playground",
    version: 1,
    runId,
    provenance: "api_response",
    input,
    entities,
    brandsCapturedAt,
    brandsBasis: "save_time",
    results: results.map((result) => {
      if (!("version" in result)) return unobservedSchema.parse(result);
      const parsed = modelColumnResultSchema.parse(result);
      const {
        paymentReceipt: _payment,
        rawEvidenceId: _raw,
        routingAttemptCredentials: _routing,
        ...safe
      } = parsed;
      return safe;
    }),
  };
  if (!boundedJson(body, MODEL_PLAYGROUND_LIMITS.reportBytes))
    throw new ModelPlaygroundReportBudgetError();
  return modelPlaygroundReportSchema.parse(body);
}

/** Only complete provider-reported amounts in one currency form a total. */
export function combinedReportedCost(
  results: readonly ModelPlaygroundReport["results"][number][],
): HistoryCost {
  const amounts = results.map((result) => {
    if (!("providerCost" in result)) return null;
    const evidence = result.costEvidence?.providerReported;
    // providerCost has no scope field; only explicit total evidence proves completeness.
    return evidence?.scope.kind === "total" ? evidence.money : null;
  });
  const currency = amounts[0]?.currency;
  if (
    !amounts.length ||
    amounts.some(
      (money) =>
        money?.certainty !== "reported" || money.amount === null || money.currency !== currency,
    )
  )
    return { kind: "unknown" };
  const values = amounts.map((money) => money?.amount ?? "0");
  const scale = Math.max(...values.map((value) => value.split(".")[1]?.length ?? 0));
  const sum = values
    .reduce((total, value) => {
      const [whole, tail = ""] = value.split(".");
      return total + BigInt(whole + tail.padEnd(scale, "0"));
    }, 0n)
    .toString()
    .padStart(scale + 1, "0");
  const value = scale ? `${sum.slice(0, -scale)}.${sum.slice(-scale)}`.replace(/\.?0+$/, "") : sum;
  return {
    kind: "amount",
    amount: { certainty: "measured", unit: { kind: "currency", code: currency ?? "USD" }, value },
  };
}

export function reportColumns(body: ModelPlaygroundReport): ResultColumn[] {
  return body.results.map((result) => {
    if ("version" in result)
      return projectColumnResult({ ...result, paymentReceipt: null, rawEvidenceId: null });
    const column: ResultColumn = {
      id: result.column.columnId,
      label: result.column.modelId,
      modelId: result.column.modelId,
      providerId: result.column.providerId,
      providerLabel: result.column.providerId,
      provenance: "api_response",
      legacySources: null,
      legacyFunding: null,
      actualProviderId: null,
      actualModelId: null,
      state: "unknown",
      answer: null,
      observedAt: null,
      durationMs: null,
      truncation: { application: false, provider: false, citations: false },
      legacyExcerpt: false,
      citations: [],
      citationTotals: { total: null, omitted: null },
      consultedSources: { sources: [], total: null, omitted: null, truncated: false },
      usage: null,
      cost: {
        money: {
          amount: null,
          currency: "USD",
          certainty: "unknown",
          basis: "unknown",
          rateCardVersion: null,
        },
        scope: null,
      },
      costEvidence: null,
    };
    return column;
  });
}
