import { schedulerDriver } from "@/lib/scheduler/driver";
/** Explicit default-off activation; this never selects a second scheduler owner. */
export function recurringMonitorsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const flag = env.LOCAL_MONITOR_RECURRING_ENABLED?.trim();
  if (flag === undefined || flag === "" || flag === "false" || flag === "0") return false;
  if (flag !== "true" && flag !== "1")
    throw new Error("LOCAL_MONITOR_RECURRING_ENABLED must be true/false or1/0.");
  return schedulerDriver(env) !== "none";
}
