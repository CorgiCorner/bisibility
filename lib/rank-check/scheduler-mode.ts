import "server-only";
import "@/lib/deployment/runtime-env.generated";

export const RANK_CHECK_SCHEDULER_MODES = ["legacy", "cutover", "dispatcher"] as const;

export type RankCheckSchedulerMode = (typeof RANK_CHECK_SCHEDULER_MODES)[number];
export type AutomaticRankCheckSource = "dispatcher" | "legacy";

type SchedulerEnvironment = Record<string, string | undefined>;

function legacyBoolean(
  env: SchedulerEnvironment,
  key: "RANK_CHECK_DISPATCHER_ENABLED" | "RANK_CHECK_RECONCILER_ENABLED",
  defaultValue: boolean,
) {
  const raw =
    key === "RANK_CHECK_DISPATCHER_ENABLED"
      ? env.RANK_CHECK_DISPATCHER_ENABLED
      : env.RANK_CHECK_RECONCILER_ENABLED;
  if (raw === undefined || raw === "") return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${key} must be a recognized boolean when the deprecated fallback is used.`);
}

function deprecatedSchedulerMode(env: SchedulerEnvironment): RankCheckSchedulerMode {
  const dispatcher = legacyBoolean(env, "RANK_CHECK_DISPATCHER_ENABLED", false);
  const reconciler = legacyBoolean(env, "RANK_CHECK_RECONCILER_ENABLED", true);
  if (dispatcher && reconciler) {
    throw new Error(
      "The deprecated rank-check scheduler flags select both schedulers; this state is unsafe.",
    );
  }
  if (dispatcher) return "dispatcher";
  return reconciler ? "legacy" : "cutover";
}

export function parseRankCheckSchedulerMode(
  env: SchedulerEnvironment = process.env as SchedulerEnvironment,
): RankCheckSchedulerMode {
  if (env.RANK_CHECK_SCHEDULER_MODE !== undefined) {
    const value = env.RANK_CHECK_SCHEDULER_MODE;
    if (value === "") return "legacy";
    if ((RANK_CHECK_SCHEDULER_MODES as readonly string[]).includes(value)) {
      return value as RankCheckSchedulerMode;
    }
    throw new Error(
      `RANK_CHECK_SCHEDULER_MODE must be exactly one of ${RANK_CHECK_SCHEDULER_MODES.join(", ")}.`,
    );
  }
  return deprecatedSchedulerMode(env);
}

export function rankCheckSchedulerMode() {
  return parseRankCheckSchedulerMode();
}

export function legacySchedulingAllowed(mode = rankCheckSchedulerMode()) {
  return mode === "legacy";
}

export function dispatcherClaimsAllowed(mode = rankCheckSchedulerMode()) {
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
  return source === "legacy" ? mode === "legacy" : mode === "dispatcher";
}
