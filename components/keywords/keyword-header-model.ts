import { quietChipVariants } from "@/components/ui/quiet-chip-styles";
import type { KeywordRow } from "@/lib/queries/keywords";
import {
  RESEARCH_METRICS_UNAVAILABLE_TOOLTIP,
  supportsResearchScope,
} from "@/lib/serp/research-capability";
import { cn } from "@/lib/ui/cn";

export const metadataChipClassName = cn(quietChipVariants({ size: "lg" }), "text-fg");

export function keywordMetricsAvailabilityNote(
  keyword: Pick<KeywordRow, "volumeKnown" | "difficultyKnown" | "location">,
) {
  const missing = [
    ...(keyword.volumeKnown === false ? ["Search volume"] : []),
    ...(keyword.difficultyKnown === false ? ["difficulty"] : []),
  ];
  if (missing.length === 0) return null;
  if (!supportsResearchScope(keyword.location.countryCode, keyword.location.hl)) {
    return RESEARCH_METRICS_UNAVAILABLE_TOOLTIP;
  }
  const label = missing.join(" and ");
  return `${label[0].toUpperCase()}${label.slice(1)} ${missing.length > 1 ? "are" : "is"} unavailable for this keyword. Rank tracking is unaffected.`;
}

export function deviceValue(value: string): "desktop" | "mobile" {
  return value.toLowerCase() === "mobile" ? "mobile" : "desktop";
}

export function deriveDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
