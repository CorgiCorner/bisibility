function isTruthyFlag(raw: string | undefined) {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function isTrafficSyncEnabled() {
  return isTruthyFlag(process.env.TRAFFIC_SYNC_ENABLED);
}
