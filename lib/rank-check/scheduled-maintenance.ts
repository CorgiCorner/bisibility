import "server-only";

// Keep the historical opt-out until the administrator sets the dedicated switch.
export function scheduledMaintenanceEnabled(env = process.env) {
  const explicit = env.SCHEDULED_MAINTENANCE_ENABLED?.trim();
  const raw = explicit || env.RANK_CHECK_RECONCILER_ENABLED?.trim();
  return !raw || ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}
