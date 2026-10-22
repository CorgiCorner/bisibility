import "server-only";
import {
  effectiveProjectLookupTtl,
  isLookupCacheKind,
} from "@/lib/provider-lookups/effective-lookup-ttl";
import type { ActionPaymentQuote } from "./contract";

type CacheChild = { cached: boolean; freeUntil?: string };

export function actionPaymentCache(input: {
  children: CacheChild[];
  feature: string;
  lookupCacheTtlSeconds?: number | null;
}): ActionPaymentQuote["cache"] {
  const allFree = input.children.every((child) => child.cached);
  const state = allFree ? "hit" : input.children.some((child) => child.cached) ? "mixed" : "miss";
  const kind = isLookupCacheKind(input.feature) ? input.feature : null;
  return {
    state,
    freeUntil: allFree
      ? (input.children
          .map((child) => child.freeUntil)
          .filter((value): value is string => Boolean(value))
          .sort()[0] ?? null)
      : null,
    windowSeconds:
      kind && (state === "miss" || state === "mixed")
        ? effectiveProjectLookupTtl(input.lookupCacheTtlSeconds, kind)
        : null,
  };
}

export function notApplicablePaymentCache(): ActionPaymentQuote["cache"] {
  return { state: "not_applicable", freeUntil: null, windowSeconds: null };
}
