import { z } from "zod";

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
      "Control characters are not allowed.",
    );
const cents = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/);
const units = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/);
export const historicalResolutionItemSchema = z
  .object({
    operationId: text(256),
    expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    receiptId: text(256),
    costCents: cents.nullable().optional(),
    units: units.nullable().optional(),
    omitUnknownUnits: z.boolean().default(false),
  })
  .strict();
export const historicalResolutionSchema = z
  .object({
    namespace: text(128),
    connection: text(256),
    operator: text(100),
    reason: text(300).refine((value) => value.length >= 8, "Explain the evidence used."),
    evidenceRef: text(200),
    recordedAt: z.iso.datetime(),
    operations: z.array(historicalResolutionItemSchema).min(1).max(25),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.operations.map((item) => item.operationId)).size !== value.operations.length)
      ctx.addIssue({
        code: "custom",
        path: ["operations"],
        message: "An operation may appear only once.",
      });
  });
export type HistoricalResolution = z.infer<typeof historicalResolutionSchema>;
export type HistoricalResolutionItem = z.infer<typeof historicalResolutionItemSchema>;
