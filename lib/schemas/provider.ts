import { z } from "zod";

const idSchema = z.string().trim().min(1).max(120);

export const providerIdSchema = z.enum([
  "dataforseo",
  "serpapi",
  "local-sequence",
  "gsc",
  "ga4",
  "plausible",
]);

const credentialSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().max(500).optional(),
);

export const providerCredentialsSchema = z.object({
  apiKey: credentialSchema,
  endpoint: credentialSchema,
  login: credentialSchema,
  secret: credentialSchema,
});

// A blank cost field (empty string, or NaN from a numeric input) means "unknown", so it must
// stay undefined instead of coercing to a zero rate.
const optionalCostSchema = z.preprocess(
  (value) =>
    value === "" || value === null || (typeof value === "number" && Number.isNaN(value))
      ? undefined
      : value,
  z.coerce.number().min(0).max(100).optional(),
);

export const connectProviderSchema = z.object({
  costPerCheck: optionalCostSchema,
  credentials: providerCredentialsSchema.optional(),
  login: credentialSchema,
  primary: z.coerce.boolean().default(false),
  projectId: idSchema,
  providerId: providerIdSchema,
  secret: credentialSchema,
});

export const testProviderConnectionSchema = z.object({
  credentials: providerCredentialsSchema.optional(),
  login: credentialSchema,
  projectId: idSchema,
  providerId: providerIdSchema,
  secret: credentialSchema,
});

export const updateProviderCostSchema = z.object({
  costPerCheck: z.coerce.number().min(0).max(100),
  projectId: idSchema,
  providerId: providerIdSchema,
});

export const providerRateFeatureSchema = z.enum([
  "rank_check",
  "keyword_research",
  "keyword_metrics",
  "ranked_keywords",
]);

export const updateProviderRateSchema = z.object({
  costPerUnit: z.coerce.number().min(0).max(100).nullable(),
  feature: providerRateFeatureSchema,
  projectId: idSchema,
  providerId: providerIdSchema,
});

const providerRateCostSchema = updateProviderRateSchema.shape.costPerUnit.unwrap();
export const PROVIDER_RATE_COST_BOUNDS = {
  maximum: providerRateCostSchema.maxValue ?? Number.POSITIVE_INFINITY,
  minimum: providerRateCostSchema.minValue ?? Number.NEGATIVE_INFINITY,
};

export const setPrimaryProviderSchema = z.object({
  primary: z.coerce.boolean().default(true),
  projectId: idSchema,
  providerId: providerIdSchema,
});

export type ConnectProviderInput = z.infer<typeof connectProviderSchema>;
export type ProviderCredentialsInput = z.infer<typeof providerCredentialsSchema>;
export type SetPrimaryProviderInput = z.infer<typeof setPrimaryProviderSchema>;
export type TestProviderConnectionInput = z.infer<typeof testProviderConnectionSchema>;
export type UpdateProviderCostInput = z.infer<typeof updateProviderCostSchema>;
export type UpdateProviderRateInput = z.infer<typeof updateProviderRateSchema>;
