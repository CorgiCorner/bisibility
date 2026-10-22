import { serpDepthValues } from "@/lib/serp/constants";
import { hasAsciiControlCharacters } from "@/lib/validation/control-characters";
import { z } from "zod";

const ref = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !(/\s/u.test(value) || hasAsciiControlCharacters(value)));
const epoch = z
  .string()
  .regex(/^(?:0|[1-9]\d*)$/u)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n);
const duration = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const depth = z.union(serpDepthValues.map((value) => z.literal(value)));
const cadence = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly", "custom_cron", "manual", "paused"]),
    cronExpression: z.string().nullable(),
    timezone: z.string().nullable(),
    jitterMinutes: z.number().int().nonnegative(),
    serpDepth: depth.nullable(),
  })
  .strict();
export const persistedPolicySchema = z
  .object({
    version: z.literal(1),
    definitionVersion: ref,
    forcedAiOverview: z.literal(false),
    adapters: z
      .array(
        z
          .object({
            providerId: ref,
            capabilityVersion: ref,
            adapterVersion: ref,
            nativeFindTargetsIn: z.enum(["none", "with_subdomains_on_match"]),
          })
          .strict(),
      )
      .min(1)
      .max(16),
    freshness: z
      .object({ configurationRevision: ref, manualTtlMs: duration, cadenceGraceMs: duration })
      .strict(),
  })
  .strict()
  .refine(
    (policy) =>
      new Set(policy.adapters.map((entry) => entry.providerId)).size === policy.adapters.length,
  );
export const definitionSourceSchema = z
  .object({
    projectId: ref,
    projectPublicId: ref,
    keywordId: ref,
    keywordPublicId: ref,
    epochs: z
      .object({
        projectTarget: epoch,
        projectPolicy: epoch,
        keywordTarget: epoch,
        keywordPolicy: epoch,
        location: epoch,
        checkSchedule: epoch.nullable(),
      })
      .strict(),
    target: z
      .object({
        domain: z.string().min(1).nullable(),
        text: z.string().min(1).max(180),
        targetUrl: z.string().nullable(),
        device: z.enum(["desktop", "mobile"]),
        locationId: ref,
        keywordLocation: z.string(),
        archivedAt: z.string().nullable(),
        location: z
          .object({
            id: ref,
            kind: z.enum(["country", "region", "city"]),
            displayName: z.string().min(1),
            countryCode: z.string().min(1),
            regionCode: z.string().nullable(),
            cityName: z.string().nullable(),
            canonicalKey: ref,
            gl: z.string().min(1),
            hl: z.string().min(1),
            languageCode: z.string().min(1),
            primaryGeoCode: z.number().int().safe().nullable(),
            primaryGeoName: z.string().min(1),
            secondaryGeoName: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    policy: z
      .object({
        config: persistedPolicySchema.nullable(),
        defaults: cadence
          .extend({
            device: z.enum(["desktop", "mobile"]).nullable(),
            locationKey: z.string().nullable(),
            country: z.string().nullable(),
            city: z.string().nullable(),
            serpStopOnMatch: z.boolean(),
          })
          .nullable(),
        keywordSchedule: cadence.extend({ id: ref }).nullable(),
        checkSchedule: cadence
          .extend({
            id: ref,
            publicId: ref,
            projectId: ref,
            enabled: z.boolean(),
            archivedAt: z.string().nullable(),
            providerPolicy: z.string().nullable(),
            timeOfDay: z.string().nullable(),
            isDefault: z.boolean(),
          })
          .nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((source, context) => {
    if (
      source.target.locationId !== source.target.location.id ||
      (source.policy.checkSchedule && source.policy.checkSchedule.projectId !== source.projectId)
    )
      context.addIssue({
        code: "custom",
        message: "Definition source belongs to another project or location.",
      });
  });
const legacyRequestSchema = z
  .object({
    engine: z.literal("google"),
    surface: z.literal("web_serp"),
    resultKind: z.literal("organic_result"),
    rankScale: z.literal("organic_group"),
    providerId: ref,
    capabilityVersion: ref,
    adapterVersion: ref,
    definitionVersion: ref,
    keyword: z.string().min(1).max(180),
    device: z.enum(["desktop", "mobile"]),
    domain: z.string().min(1),
    targetUrl: z.string().nullable(),
    location: definitionSourceSchema.shape.target.shape.location,
    depth,
    stopOnMatch: z.boolean(),
    findTargetsIn: z.string().max(128).nullable(),
    forcedAiOverview: z.literal(false),
  })
  .strict();
/** Missing version remains the exact v1 shape; no default mutates historical JSON. */
export const requestSchema = z.union([
  legacyRequestSchema,
  legacyRequestSchema.extend({ compilerVersion: z.literal(2) }).strict(),
]);
export const configurePolicySchema = z
  .object({ projectId: ref, expectedPolicyEpoch: epoch, config: persistedPolicySchema })
  .strict();
