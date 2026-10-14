import { identitySnapshotSchema, referenceSchema } from "@/lib/business-locations/schema";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { z } from "zod";

export const MAX_BUSINESS_VERSION = 2_147_483_647;
export const MAX_MATCH_BATCH_ITEMS = 256;
const expectedVersion = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_BUSINESS_VERSION - 1);
const reason = z.string().trim().min(1).max(500);
const projectId = z.string().refine((value) => isPublicIdOfType(value, "prj"));
const locationId = z.string().refine((value) => isPublicIdOfType(value, "biz"));
const identifier = z
  .object({
    namespace: z.literal("google_business"),
    engine: z.literal("google"),
    type: z.enum(["cid", "place_id"]),
    value: z.string(),
  })
  .strict();
const fields = identitySnapshotSchema.shape;
const identityFields = {
  name: fields.name,
  address: fields.address,
  domain: fields.domain,
  coordinates: fields.coordinates,
  mapsUrl: fields.mapsUrl,
  identifiers: z.array(identifier).max(16),
};
export const identityInputSchema = z
  .object({ ...identityFields, identifiers: identityFields.identifiers.default([]) })
  .strict();
export const identityPatchSchema = z
  .object(identityFields)
  .partial()
  .strict()
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    "An identity change is required.",
  );
const command = { projectId, idempotencyKey: referenceSchema };
export const createLocationSchema = z
  .object({
    ...command,
    role: z.enum(["subject", "competitor"]),
    identity: identityInputSchema,
    reason,
  })
  .strict();
export const reviseLocationSchema = z
  .object({
    ...command,
    locationId,
    expectedRevision: expectedVersion,
    patch: identityPatchSchema,
    reason,
  })
  .strict();
export const stateLocationSchema = z
  .object({ ...command, locationId, expectedVersion, state: z.enum(["active", "archived"]) })
  .strict();
export const rematchLocationSchema = z
  .object({
    ...command,
    locationId,
    identityRevisionId: referenceSchema,
    observationRunId: referenceSchema,
    expectedDecisions: z
      .array(z.object({ itemId: referenceSchema, expectedRevision: expectedVersion }).strict())
      .min(1)
      .max(MAX_MATCH_BATCH_ITEMS),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.expectedDecisions.map(({ itemId }) => itemId)).size ===
      input.expectedDecisions.length,
    "Duplicate observation item.",
  );
export const reviewMatchSchema = z
  .object({
    ...command,
    locationId,
    identityRevisionId: referenceSchema,
    observationRunId: referenceSchema,
    itemId: referenceSchema,
    decisionId: referenceSchema,
    expectedDecisionRevision: expectedVersion,
    action: z.enum(["confirm", "reject"]),
    reason,
  })
  .strict();
export const assignmentScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("keyword"),
      id: z.string().refine((value) => isPublicIdOfType(value, "kw")),
    })
    .strict(),
  z
    .object({
      kind: z.literal("market"),
      id: z.string().refine((value) => isPublicIdOfType(value, "pmkt")),
    })
    .strict(),
]);
export const assignLocationSchema = z
  .object({
    ...command,
    scope: assignmentScopeSchema,
    expectedRevision: expectedVersion,
    target: z.object({ locationId, identityRevisionId: referenceSchema }).strict().nullable(),
    reason,
  })
  .strict();
export const mutationReceiptSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("identity"),
      entityId: referenceSchema,
      publicId: locationId,
      revisionId: referenceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("state"),
      entityId: referenceSchema,
      publicId: locationId,
      version: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("match"),
      entityId: referenceSchema,
      publicId: locationId,
      decisionIds: z.array(referenceSchema).min(1),
    })
    .strict(),
  z
    .object({ kind: z.literal("assignment"), headId: referenceSchema, revisionId: referenceSchema })
    .strict(),
]);
export type BusinessMutationReceipt = z.infer<typeof mutationReceiptSchema>;
