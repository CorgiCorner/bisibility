import type { SeoMixInputs, SeoMixPreset } from "@/lib/cost-estimate/seo-mix-contract";

export const SEO_COST_VOLUME_BUCKETS = ["0", "1-50", "51-100", "101-500", "501-1000"] as const;
function volumeBucket(value: number): (typeof SEO_COST_VOLUME_BUCKETS)[number] {
  if (value === 0) return "0";
  if (value <= 50) return "1-50";
  if (value <= 100) return "51-100";
  if (value <= 500) return "101-500";
  return "501-1000";
}
export function seoCostCalculatorProperties(
  inputs: SeoMixInputs,
  surface: "home" | "pricing",
  preset: SeoMixPreset | null,
) {
  return {
    surface,
    selection: preset ?? "custom",
    frequency: inputs.frequency,
    funding_mode: inputs.fundingMode,
    rank_volume: volumeBucket(inputs.keywordCount),
    research_volume: volumeBucket(inputs.researchCount),
    domain_volume: volumeBucket(inputs.domainCount),
    backlink_volume: volumeBucket(inputs.backlinkCount),
  };
}
