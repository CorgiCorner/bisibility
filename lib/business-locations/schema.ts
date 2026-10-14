import { hasAsciiControlCharacters } from "@/lib/validation/control-characters";
import { z } from "zod";
import {
  businessDomainCandidateKey,
  normalizeGoogleMapsUrl,
  opaqueBusinessIdentifier,
} from "./identity-normalization";

export const referenceSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !(/\s/u.test(value) || hasAsciiControlCharacters(value)));
export const timestampSchema = z.iso.datetime({ offset: true });

export const identifierSchema = z
  .object({
    namespace: z.literal("google_business"),
    engine: z.literal("google"),
    type: z.enum(["cid", "place_id"]),
    value: z.string(),
    provenance: z
      .object({
        source: z.enum(["user", "retained_observation", "maps_url"]),
        referenceId: referenceSchema.nullable(),
        recordedAt: timestampSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((identifier, context) => {
    if (!opaqueBusinessIdentifier(identifier.value, identifier.type).ok) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "A valid opaque textual identifier is required.",
      });
    }
    if (
      identifier.provenance.source === "retained_observation" &&
      !identifier.provenance.referenceId
    ) {
      context.addIssue({
        code: "custom",
        path: ["provenance", "referenceId"],
        message: "Observation provenance is required.",
      });
    }
  });

export const identitySnapshotSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => Boolean(value.trim()) && !hasAsciiControlCharacters(value)),
    address: z.string().max(500).nullable().optional(),
    domain: z
      .string()
      .max(253)
      .refine((value) => businessDomainCandidateKey(value) !== null, "Invalid website domain.")
      .nullable()
      .optional(),
    coordinates: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
      })
      .strict()
      .nullable()
      .optional(),
    mapsUrl: z
      .string()
      .max(4096)
      .refine((value) => normalizeGoogleMapsUrl(value) !== null, "Unsupported Maps URL.")
      .transform((value) => normalizeGoogleMapsUrl(value) as string)
      .nullable()
      .optional(),
    identifiers: z.array(identifierSchema).max(16).default([]),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const seen = new Set<string>();
    for (const [index, identifier] of snapshot.identifiers.entries()) {
      const key = `${identifier.namespace}:${identifier.engine}:${identifier.type}`;
      if (seen.has(key))
        context.addIssue({
          code: "custom",
          path: ["identifiers", index],
          message: "Conflicting or duplicate identifier type.",
        });
      seen.add(key);
    }
  });

export const identityRevisionSchema = z
  .object({
    id: referenceSchema,
    entityId: referenceSchema,
    projectId: referenceSchema,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    previousRevisionId: referenceSchema.nullable(),
    effectiveFrom: timestampSchema,
    normalizerVersion: referenceSchema,
    actorId: referenceSchema.nullable(),
    reason: z.string().trim().min(1).max(500),
    snapshot: identitySnapshotSchema,
  })
  .strict();
