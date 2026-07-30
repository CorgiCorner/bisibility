import "server-only";

import { positiveTtl, withProviderLookupCache } from "@/lib/provider-lookups/cache";
import type { BacklinkRowMode, BacklinkTargetScope } from "@/lib/providers/types";
import type { BacklinksSnapshot } from "./types";

export const DEFAULT_TTL_SECONDS = 86_400;

export function backlinksCacheTtlSeconds() {
  return positiveTtl(process.env.BACKLINKS_CACHE_TTL_SECONDS, DEFAULT_TTL_SECONDS);
}

export function backlinksCachedUntil(fetchedAt: string | Date) {
  const timestamp = new Date(fetchedAt).getTime();
  return new Date(timestamp + backlinksCacheTtlSeconds() * 1000).toISOString();
}

export function backlinksCacheKey(input: {
  includeSubdomains: boolean;
  mode: BacklinkRowMode;
  projectId: string;
  scope: BacklinkTargetScope;
  target: string;
}) {
  return `bl:v1:${input.projectId}:${input.target}:${input.scope}:${input.includeSubdomains ? 1 : 0}:${input.mode}`;
}

export function withBacklinksCache(input: {
  fresh?: boolean;
  key: string;
  load: () => Promise<BacklinksSnapshot>;
}) {
  return withProviderLookupCache({ ...input, ttlSeconds: backlinksCacheTtlSeconds() });
}
