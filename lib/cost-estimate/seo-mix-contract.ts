import { z } from "zod";
import {
  CALCULATOR_KEYWORD_MAX,
  CALCULATOR_LOCATION_MAX,
  CALCULATOR_LOCATION_MIN,
} from "./calculator-bounds";
import type { ProviderRate } from "./estimate";

export const SEO_MIX_FIELDS = [
  "keywordCount",
  "researchCount",
  "domainCount",
  "backlinkCount",
] as const;
export type SeoMixField = (typeof SEO_MIX_FIELDS)[number];
export const SEO_MIX_FIELD_BOUNDS = {
  keywordCount: { min: 0, max: CALCULATOR_KEYWORD_MAX },
  researchCount: { min: 0, max: 500 },
  domainCount: { min: 0, max: 500 },
  backlinkCount: { min: 0, max: 500 },
} as const;
const count = z
  .number()
  .int()
  .min(SEO_MIX_FIELD_BOUNDS.researchCount.min)
  .max(SEO_MIX_FIELD_BOUNDS.researchCount.max);
export const seoMixSchema = z.strictObject({
  keywordCount: z.number().int().min(0).max(CALCULATOR_KEYWORD_MAX),
  researchCount: count,
  domainCount: count,
  backlinkCount: count,
  frequency: z.enum(["weekly", "daily"]),
  fundingMode: z.enum(["credits", "byok"]),
  providerId: z.enum(["dataforseo", "serpapi"]),
  optionKey: z.enum(["standard", "priority", "live"]),
  planKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  depth: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]),
  devices: z.enum(["desktop", "mobile", "both"]),
  locationCount: z.number().int().min(CALCULATOR_LOCATION_MIN).max(CALCULATOR_LOCATION_MAX),
});
export type SeoMixInputs = z.infer<typeof seoMixSchema>;
export const SEO_MIX_DEFAULTS: SeoMixInputs = {
  keywordCount: 100,
  researchCount: 50,
  domainCount: 10,
  backlinkCount: 5,
  frequency: "weekly",
  fundingMode: "credits",
  providerId: "dataforseo",
  optionKey: "priority",
  planKey: "auto",
  depth: 20,
  devices: "both",
  locationCount: 1,
};
export const SEO_MIX_PRESETS = {
  light: [100, 50, 10, 5],
  steady: [500, 100, 25, 15],
  busy: [1000, 300, 100, 50],
} as const;
export type SeoMixPreset = keyof typeof SEO_MIX_PRESETS;
export type SeoMixOperation = "rank" | "research" | "domains" | "backlinks";
export type SeoMixPolicy = { marginBps: number; floorCentsPerUnit: string | null };
export type SeoMixComponent = {
  key: string;
  providerId: string;
  providerCostCents: string | null;
  quantity: number;
  checkedAt: string;
  sourceUrl: string;
};
export type SeoMixAccess = {
  state: "not_started" | "pending" | "enforced" | "unavailable";
  effectiveAt: string | null;
  monthlyCents: Record<SeoMixInputs["fundingMode"], string>;
  annualCents: Record<SeoMixInputs["fundingMode"], string>;
};
export type SeoMixSnapshot = {
  rankRates: ProviderRate[];
  operations: Record<Exclude<SeoMixOperation, "rank">, SeoMixComponent[]>;
  policies: Record<SeoMixOperation, SeoMixPolicy>;
  access: SeoMixAccess;
  assumptions: {
    researchLimit: number;
    researchMode: "auto";
    clickstream: boolean;
    domainKeywordLimit: number;
    domainPageLimit: number;
    domainHistoryMonths: number;
    backlinkLimit: number;
    backlinkScope: "site";
    backlinkHistoryMonths: number;
  };
  packagesCents: number[];
  minimumCreditCents: number;
};
