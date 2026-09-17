import { quietChipVariants } from "@/components/ui/quiet-chip-styles";
import type { KeywordRow } from "@/lib/queries/keywords";
import { supportsResearchScope } from "@/lib/serp/research-capability";
import { cn } from "@/lib/ui/cn";

export const metadataChipClassName = cn(quietChipVariants({ size: "lg" }), "text-fg");

export type KeywordMetricsAvailability =
  | { kind: "unsupported" }
  | { kind: "missing"; metrics: readonly ("volume" | "difficulty")[] }
  | null;

export function keywordMetricsAvailability(
  keyword: Pick<KeywordRow, "volumeKnown" | "difficultyKnown" | "location">,
): KeywordMetricsAvailability {
  const metrics = [
    ...(keyword.volumeKnown === false ? (["volume"] as const) : []),
    ...(keyword.difficultyKnown === false ? (["difficulty"] as const) : []),
  ];
  if (metrics.length === 0) return null;
  if (!supportsResearchScope(keyword.location.countryCode, keyword.location.hl)) {
    return { kind: "unsupported" };
  }
  return { kind: "missing", metrics };
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
