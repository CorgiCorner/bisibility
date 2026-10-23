import "server-only";
import "@/lib/deployment/runtime-env.generated";

// Legacy remains a historical diagnostic/payload value; configuration cannot activate it.
export const RANK_CHECK_SCHEDULER_MODES = ["legacy", "cutover", "dispatcher"] as const;

export type RankCheckSchedulerMode = (typeof RANK_CHECK_SCHEDULER_MODES)[number];
export type AutomaticRankCheckSource = "dispatcher" | "legacy";

type SchedulerEnvironment = Record<string, string | undefined>;

export function parseRankCheckSchedulerMode(
  env: SchedulerEnvironment = process.env as SchedulerEnvironment,
): RankCheckSchedulerMode {
  const value = env.RANK_CHECK_SCHEDULER_MODE;
  if (value === undefined || value === "" || value === "dispatcher" || value === "legacy")
    return "dispatcher";
  if (value === "cutover") return "cutover";
  throw new Error("RANK_CHECK_SCHEDULER_MODE must be exactly dispatcher or cutover.");
}

export function warnRetiredRankSchedulerConfiguration(
  env: SchedulerEnvironment = process.env as SchedulerEnvironment,
  warn: (message: string) => void = console.warn,
) {
  const retired: string[] = (
    [
      ["RANK_CHECK_RECONCILER_ENABLED", env.RANK_CHECK_RECONCILER_ENABLED],
      ["RANK_CHECK_DISPATCHER_ENABLED", env.RANK_CHECK_DISPATCHER_ENABLED],
    ] as const
  )
    .filter(([, raw]) => raw !== undefined && raw !== "")
    .map(([key]) => key);
  if (env.RANK_CHECK_SCHEDULER_MODE === "legacy") retired.push("RANK_CHECK_SCHEDULER_MODE=legacy");
  if (!retired.length) return;
  warn(
    `Retired rank scheduler configuration: ${retired.join(", ")}. The worker upgrades scheduling automatically; named Schedules are authoritative. Stop old workers before starting this version. Remove retired settings when convenient. To retain the old maintenance opt-out, set SCHEDULED_MAINTENANCE_ENABLED=0. Guide: https://bisibility.com/docs/self-hosting/scheduler-upgrade`,
  );
}

export function rankCheckSchedulerMode() {
  return parseRankCheckSchedulerMode();
}

export function dispatcherClaimsAllowed(mode = rankCheckSchedulerMode()) {
  return mode === "dispatcher";
}

export function plannerOwnsAutomaticChecks(mode = rankCheckSchedulerMode()) {
  return mode === "dispatcher";
}

export function dispatcherStateHealingAllowed(mode = rankCheckSchedulerMode()) {
  return mode === "cutover" || mode === "dispatcher";
}

export function manualRankChecksAllowed(_mode = rankCheckSchedulerMode()) {
  return true;
}

export function automaticProviderExecutionAllowed(
  mode: RankCheckSchedulerMode,
  source: AutomaticRankCheckSource,
) {
  return source === "dispatcher" && mode === "dispatcher";
}
