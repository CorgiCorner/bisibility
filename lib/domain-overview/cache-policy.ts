import "server-only";
import {
  instanceLookupTtl,
  projectCacheFreshness,
  projectCacheTtl,
} from "@/lib/provider-lookups/project-cache-policy";

export const DEFAULT_TTL_SECONDS = 43_200;
const DEMO_TTL_SECONDS = 30 * 24 * 60 * 60;

function usesDemoCacheWindow() {
  return process.env.READ_ONLY_DEMO === "1" || process.env.DEMO_MODE === "editable";
}

export function domainOverviewCacheTtlSeconds() {
  if (usesDemoCacheWindow()) return projectCacheTtl(DEMO_TTL_SECONDS);
  const configured = Number(process.env.DOMAIN_OVERVIEW_CACHE_TTL_SECONDS);
  return projectCacheTtl(
    Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_TTL_SECONDS,
  );
}

export function domainOverviewCachedUntil(fetchedAt: string | Date) {
  return new Date(
    new Date(fetchedAt).getTime() + domainOverviewCacheTtlSeconds() * 1000,
  ).toISOString();
}

export function domainOverviewSnapshotCachedUntil(snapshot: {
  cachedUntil: Date;
  fetchedAt: Date;
}) {
  return usesDemoCacheWindow() && projectCacheTtl(DEMO_TTL_SECONDS) === DEMO_TTL_SECONDS
    ? domainOverviewCachedUntil(snapshot.fetchedAt)
    : new Date(
        Math.min(
          snapshot.cachedUntil.getTime(),
          new Date(domainOverviewCachedUntil(snapshot.fetchedAt)).getTime(),
        ),
      ).toISOString();
}

export function domainOverviewSnapshotFreshness(now: Date) {
  return usesDemoCacheWindow()
    ? {
        ...projectCacheFreshness(now, instanceLookupTtl("do:"), "cachedUntil"),
        cachedUntil: { gt: new Date(0) },
        fetchedAt: { gt: new Date(now.getTime() - domainOverviewCacheTtlSeconds() * 1000) },
      }
    : {
        ...projectCacheFreshness(now, instanceLookupTtl("do:"), "cachedUntil"),
        cachedUntil: { gt: now },
      };
}
