export const SCHEDULER_DRIVERS = ["temporal", "none"] as const;
export const RESERVED_SCHEDULER_DRIVERS = ["external-cron"] as const;

export type SchedulerDriver = (typeof SCHEDULER_DRIVERS)[number];
export type ResolvedSchedulerDriver = SchedulerDriver | "legacy-auto";
export type DiagnosticSchedulerDriver = ResolvedSchedulerDriver | "invalid";

export class SchedulerDisabledError extends Error {
  readonly code = "scheduler_disabled";

  constructor() {
    super("Scheduled execution is disabled for this deployment.");
    this.name = "SchedulerDisabledError";
  }
}

function optionalEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function schedulerDriver(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ResolvedSchedulerDriver {
  const value = optionalEnv(env.SCHEDULER_DRIVER);
  if (value === undefined) return "legacy-auto";
  if ((SCHEDULER_DRIVERS as readonly string[]).includes(value)) {
    return value as SchedulerDriver;
  }
  if ((RESERVED_SCHEDULER_DRIVERS as readonly string[]).includes(value)) {
    throw new Error(`SCHEDULER_DRIVER=${value} is recognized but not supported yet.`);
  }
  throw new Error(`SCHEDULER_DRIVER must be exactly one of ${SCHEDULER_DRIVERS.join(", ")}.`);
}

export function resolveSchedulerDriver(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { driver: DiagnosticSchedulerDriver } {
  try {
    return { driver: schedulerDriver(env) };
  } catch {
    return { driver: "invalid" };
  }
}

export function assertTemporalSchedulerEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): "temporal" | "legacy-auto" {
  const driver = schedulerDriver(env);
  if (driver === "none") throw new SchedulerDisabledError();
  return driver;
}
