import "server-only";

export const DEFAULT_TTL_SECONDS = 43_200;
const DEMO_TTL_SECONDS = 30 * 24 * 60 * 60;

function usesDemoCacheWindow() {
  return process.env.READ_ONLY_DEMO === "1" || process.env.DEMO_MODE === "editable";
}

export function domainOverviewCacheTtlSeconds() {
  if (usesDemoCacheWindow()) return DEMO_TTL_SECONDS;
  const configured = Number(process.env.DOMAIN_OVERVIEW_CACHE_TTL_SECONDS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_TTL_SECONDS;
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
  return usesDemoCacheWindow()
    ? domainOverviewCachedUntil(snapshot.fetchedAt)
    : snapshot.cachedUntil.toISOString();
}

export function domainOverviewSnapshotFreshness(now: Date) {
  return usesDemoCacheWindow()
    ? { fetchedAt: { gt: new Date(now.getTime() - domainOverviewCacheTtlSeconds() * 1000) } }
    : { cachedUntil: { gt: now } };
}
