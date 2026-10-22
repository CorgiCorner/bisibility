import type { DefinitionFreshnessPorts, DefinitionSource, DefinitionTransaction } from "./model";

export async function definitionFreshness(
  tx: DefinitionTransaction,
  source: DefinitionSource,
  asOf: Date,
  host: DefinitionFreshnessPorts,
) {
  const config = source.policy.config?.freshness;
  if (!config) return { freshForMs: null, freshnessReason: "policy_unavailable" as const };
  const schedule = source.policy.checkSchedule;
  if (
    !schedule ||
    !schedule.enabled ||
    schedule.archivedAt ||
    schedule.frequency === "manual" ||
    schedule.frequency === "paused"
  )
    return {
      freshForMs: config.manualTtlMs,
      freshnessReason: config.manualTtlMs === null ? ("policy_unavailable" as const) : null,
    };
  const interval = await host.cadenceIntervalMs(tx, source, asOf);
  if (interval === null || config.cadenceGraceMs === null)
    return { freshForMs: null, freshnessReason: "policy_unavailable" as const };
  const total = interval + config.cadenceGraceMs;
  if (!Number.isSafeInteger(interval) || interval < 0 || !Number.isSafeInteger(total))
    return { freshForMs: null, freshnessReason: "invalid_policy" as const };
  return { freshForMs: total, freshnessReason: null };
}
