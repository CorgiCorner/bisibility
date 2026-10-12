import { parsePublicId } from "@/lib/db/public-id";
import { parseProviderDecimal } from "@usagekit/views";
import { z } from "zod";
import { parseNativeAllocation, parseNativeRateCents } from "./form-schema";

const identifier = z.string().min(1).max(160);
const connectionId = identifier.refine((id) => parsePublicId(id)?.prefix === "conn");
const decimal = z.string().max(80);
const nonce = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const surface = z.enum(["app", "programmatic"]);
const rateId = z.enum(["rank_check", "keyword_research", "keyword_metrics", "ranked_keywords"]);
const distinct = <T>(items: readonly T[], key: (item: T) => string) =>
  new Set(items.map(key)).size === items.length;

export const providerUiQuerySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("connections"), provider: identifier.optional() }).strict(),
  z.object({ kind: z.literal("details"), connectionId }).strict(),
  z.object({ kind: z.literal("balance"), connectionId }).strict(),
  z
    .object({
      kind: z.literal("projection"),
      connectionId,
      operation: identifier,
      quantity: decimal.refine(
        (value) => parseProviderDecimal(value, "units", 6).outcome === "valid",
      ),
      unit: identifier,
      surface,
    })
    .strict(),
  z
    .object({
      kind: z.literal("allocations"),
      connectionIds: z
        .array(connectionId)
        .max(50)
        .refine((ids) => distinct(ids, (id) => id)),
    })
    .strict(),
]);

export const providerUiCommandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("project_chain"),
      commandId: nonce,
      expectedRevision: revision,
      entries: z
        .array(
          z.object({ id: connectionId, enabled: z.boolean(), expectedRevision: revision }).strict(),
        )
        .min(1)
        .max(50)
        .refine((rows) => distinct(rows, (row) => row.id)),
    })
    .strict(),
  z
    .object({
      kind: z.literal("rates"),
      commandId: nonce,
      connectionId,
      expectedRevision: revision,
      rates: z
        .array(
          z
            .object({
              rateId,
              price: decimal.refine((value) => parseNativeRateCents(value) !== null).nullable(),
            })
            .strict(),
        )
        .min(1)
        .max(4)
        .refine((rows) => distinct(rows, (row) => row.rateId)),
    })
    .strict(),
  z
    .object({
      kind: z.literal("allocations"),
      commandId: nonce,
      expectedRevision: revision,
      changes: z
        .array(
          z
            .object({
              rowId: identifier,
              expectedRevision: revision,
              limit: decimal
                .refine((value) => parseNativeAllocation(value, "units") !== null)
                .nullable()
                .optional(),
            })
            .strict(),
        )
        .min(1)
        .max(200)
        .refine((rows) => distinct(rows, (row) => row.rowId)),
    })
    .strict(),
]);

export type ProviderUiCommand = z.infer<typeof providerUiCommandSchema>;
