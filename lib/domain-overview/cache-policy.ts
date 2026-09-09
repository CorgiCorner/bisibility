import "server-only";

export const DEFAULT_TTL_SECONDS = 43_200;
const DEMO_TTL_SECONDS = 30 * 24 * 60 * 60;

export function domainOverviewCacheTtlSeconds() {
  if (process.env.READ_ONLY_DEMO === "1") return DEMO_TTL_SECONDS;
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
  return process.env.READ_ONLY_DEMO === "1"
    ? domainOverviewCachedUntil(snapshot.fetchedAt)
    : snapshot.cachedUntil.toISOString();
}

export function domainOverviewSnapshotFreshness(now: Date) {
  return process.env.READ_ONLY_DEMO === "1"
    ? { fetchedAt: { gt: new Date(now.getTime() - domainOverviewCacheTtlSeconds() * 1000) } }
    : { cachedUntil: { gt: now } };
}
