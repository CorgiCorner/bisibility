import "server-only";
import {
  deleteProviderLookupCache,
  positiveTtl,
  withProviderLookupCache,
} from "@/lib/provider-lookups/cache";
import { projectCacheTtl } from "@/lib/provider-lookups/project-cache-policy";
import type { BacklinkRowMode, BacklinkTargetScope } from "@/lib/providers/types";
import type { BacklinksSnapshot } from "./types";

export const DEFAULT_TTL_SECONDS = 86_400;

export function backlinksCacheTtlSeconds() {
  return projectCacheTtl(positiveTtl(process.env.BACKLINKS_CACHE_TTL_SECONDS, DEFAULT_TTL_SECONDS));
}

export function backlinksCachedUntil(fetchedAt: string | Date) {
  const timestamp = new Date(fetchedAt).getTime();
  return new Date(timestamp + backlinksCacheTtlSeconds() * 1000).toISOString();
}

export function backlinksCacheKey(input: {
  includeSubdomains: boolean;
  mode: BacklinkRowMode;
  projectId: string;
  provider: string;
  resultLimit?: number;
  scope: BacklinkTargetScope;
  target: string;
}) {
  return `bl:v3:${input.projectId}:${encodeURIComponent(input.provider)}:${input.target}:${input.scope}:${input.includeSubdomains ? 1 : 0}:${input.mode}:${input.resultLimit ?? 100}`;
}

export function withBacklinksCache(input: {
  fresh?: boolean;
  key: string;
  load: () => Promise<BacklinksSnapshot>;
}) {
  return withProviderLookupCache({ ...input, ttlSeconds: backlinksCacheTtlSeconds() });
}

export async function invalidateBacklinksCache(input: Parameters<typeof backlinksCacheKey>[0]) {
  await Promise.all(
    [100, 300, 500, 1000].map((resultLimit) =>
      deleteProviderLookupCache(backlinksCacheKey({ ...input, resultLimit })),
    ),
  );
}
