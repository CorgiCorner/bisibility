import type { ProviderRate } from "./estimate";
import {
  SEO_MIX_DEFAULTS,
  SEO_MIX_FIELDS,
  type SeoMixInputs,
  seoMixSchema,
} from "./seo-mix-contract";

const queryKeys = {
  keywordCount: "seo_keywords",
  researchCount: "seo_research",
  domainCount: "seo_domains",
  backlinkCount: "seo_backlinks",
  frequency: "seo_frequency",
  fundingMode: "seo_funding",
  providerId: "seo_provider",
  optionKey: "seo_queue",
  planKey: "seo_plan",
  depth: "seo_depth",
  devices: "seo_devices",
  locationCount: "seo_locations",
} as const satisfies Record<keyof SeoMixInputs, string>;
const numericKeys = new Set([
  "keywordCount",
  "researchCount",
  "domainCount",
  "backlinkCount",
  "depth",
  "locationCount",
]);
const preservedQueryKeys = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_source_platform",
  "utm_creative_format",
  "utm_marketing_tactic",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "li_fat_id",
  "src",
  "landing",
  "locale",
]);
const visibleFields = new Set<string>([...SEO_MIX_FIELDS, "frequency", "depth"]);
export function decodeSeoMixQuery(
  params: URLSearchParams,
  rates?: readonly ProviderRate[],
  { includeAdvanced = true }: { includeAdvanced?: boolean } = {},
) {
  // Hidden controls cannot restore invisible choices or invalidate the visible workload.
  const entries = Object.entries(queryKeys).filter(
    ([key]) => includeAdvanced || visibleFields.has(key),
  );
  const restored = params.has("seo_v") || entries.some(([, key]) => params.has(key));
  const fallback = (invalid: boolean) => ({ inputs: { ...SEO_MIX_DEFAULTS }, invalid, restored });
  if (!restored) return fallback(false);
  if (params.getAll("seo_v").length !== 1 || params.get("seo_v") !== "1") return fallback(true);
  const candidate: Record<string, unknown> = { ...SEO_MIX_DEFAULTS };
  for (const [key, queryKey] of entries) {
    const values = params.getAll(queryKey);
    if (values.length > 1) return fallback(true);
    if (values.length === 0) continue;
    if (numericKeys.has(key) && !/^\d+$/.test(values[0])) return fallback(true);
    candidate[key] = numericKeys.has(key) ? Number(values[0]) : values[0];
  }
  const parsed = seoMixSchema.safeParse(candidate);
  if (parsed.success) {
    const rate = rates?.find((rate) => rate.providerId === parsed.data.providerId);
    if (rates && !rate) return fallback(true);
    if (
      rate?.pricingModel === "flat" &&
      !rate.options.some((option) => option.key === parsed.data.optionKey)
    )
      return fallback(true);
    if (
      parsed.data.planKey !== "auto" &&
      (rate?.pricingModel !== "plan" ||
        !rate.plans.some((plan) => plan.planKey === parsed.data.planKey))
    )
      return fallback(true);
  }
  return parsed.success ? { inputs: parsed.data, invalid: false, restored } : fallback(true);
}
export function encodeSeoMixQuery(
  inputs: SeoMixInputs,
  existing = new URLSearchParams(),
  rates?: readonly ProviderRate[],
) {
  const parsed = seoMixSchema.parse(inputs);
  const params = new URLSearchParams();
  for (const [key, value] of existing) if (preservedQueryKeys.has(key)) params.append(key, value);
  params.set("seo_v", "1");
  for (const [key, queryKey] of Object.entries(queryKeys))
    params.set(queryKey, String(parsed[key as keyof SeoMixInputs]));
  if (decodeSeoMixQuery(params, rates).invalid)
    throw new Error("Unsupported shared calculator option");
  return params;
}
