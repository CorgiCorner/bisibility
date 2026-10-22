import "server-only";
import { instanceLookupTtl } from "./project-cache-policy";

const lookupKindKey = {
  ai_visibility: "ai:",
  backlinks: "bl:",
  domain_overview: "do:",
  keyword_metrics: "km:",
  keyword_research: "kr:",
  prompt_explorer: "ai:",
  ranked_keywords: "rk:",
} as const;

export type LookupCacheKind = keyof typeof lookupKindKey;

export function isLookupCacheKind(feature: string): feature is LookupCacheKind {
  return Object.hasOwn(lookupKindKey, feature);
}

/** Project setting when present, otherwise the instance default for that lookup kind. */
export function effectiveProjectLookupTtl(
  lookupCacheTtlSeconds: number | null | undefined,
  kind: LookupCacheKind,
): number {
  if (typeof lookupCacheTtlSeconds === "number") return lookupCacheTtlSeconds;
  return instanceLookupTtl(lookupKindKey[kind]);
}
