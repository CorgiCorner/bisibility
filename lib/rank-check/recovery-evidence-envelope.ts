import { z } from "zod";

const envelopeTarget = z.object({
  keywordId: z.string(),
  projectId: z.string(),
  queuedTaskId: z.string().nullable(),
  expectedUrlAtCheck: z.string().nullable(),
  attempts: z.array(z.object({ provider: z.string(), message: z.string() })),
});

const envelopeResult = z
  .object({
    definitionBindingId: z.string().nullable().optional(),
    rankCheck: z
      .object({
        keywordId: z.string(),
        provider: z.string(),
        checkedAt: z.iso.datetime(),
        requestedDepth: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]),
        position: z.number().int().nullable(),
        previousPosition: z.number().int().nullable(),
        rankingUrl: z.string().nullable(),
        normalizationVersion: z.string(),
        organicRanks: z.array(z.object({ domain: z.string(), position: z.number() })).nullable(),
        raw: z.record(z.string(), z.unknown()).nullable(),
        observation: z.unknown().optional(),
        billingUnits: z.number().nullable(),
        costCents: z.number().nullable(),
        estimatedCostCents: z.number().nullable(),
      })
      .passthrough(),
  })
  .passthrough();

export const retainedRankResultEnvelopeV1 = z.object({
  version: z.literal(1),
  contextHash: z.string().regex(/^[a-f0-9]{64}$/),
  target: envelopeTarget,
  result: envelopeResult,
});

export const retainedRankResultEnvelopeV2 = retainedRankResultEnvelopeV1.extend({
  version: z.literal(2),
  finishedAt: z.iso.datetime(),
  operationPk: z.string().optional(),
  attemptId: z.string().optional(),
  completeness: z.enum(["complete", "partial"]),
  returnedDepth: z.number().int().min(0).max(100),
  /** Historical GoTo repair. It keeps the original check and does not open incidents. */
  historicalRepair: z.literal(true).optional(),
});

export const retainedRankResultEnvelope = z.discriminatedUnion("version", [
  retainedRankResultEnvelopeV1,
  retainedRankResultEnvelopeV2,
]);

export type RetainedRankResultEnvelope = z.infer<typeof retainedRankResultEnvelope>;

/** New complete results require the original operation and attempt binding. */
export function readRetainedRankResultEnvelope(value: unknown) {
  const envelope = retainedRankResultEnvelope.parse(value);
  if (envelope.version === 1) {
    return {
      completeness: "unknown" as const,
      envelope,
      finishedAt: null,
      restorable: true as const,
      returnedDepth: null,
    };
  }
  return {
    completeness: envelope.completeness,
    envelope,
    finishedAt: envelope.finishedAt,
    restorable:
      envelope.completeness === "complete" &&
      (envelope.historicalRepair === true || (!!envelope.operationPk && !!envelope.attemptId)),
    returnedDepth: envelope.returnedDepth,
  };
}
