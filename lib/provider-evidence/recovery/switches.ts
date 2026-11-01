import { readDemoConfig } from "@/lib/demo/config";

export type RecoverySwitches = {
  capture: boolean;
  lookup: boolean;
  proofWrites: boolean;
  restore: boolean;
  incidentBell: boolean;
  incidentDigest: boolean;
};

let warnedInvalidMode = false;

export function recoverySwitches(
  env: Record<string, string | undefined> = process.env,
): RecoverySwitches {
  const mode = env.PROVIDER_RECOVERY ?? "off";
  if (!["off", "observe", "on"].includes(mode) && !warnedInvalidMode) {
    warnedInvalidMode = true;
    console.warn("Invalid PROVIDER_RECOVERY mode; accepted values: off, observe, on. Using off.");
  }
  const active = readDemoConfig(env).kind === "disabled";
  const observe = active && (mode === "observe" || mode === "on");
  const on = active && mode === "on";
  return {
    capture: observe,
    lookup: observe,
    proofWrites: on,
    restore: on,
    incidentBell: on,
    incidentDigest: on && (env.PROVIDER_RECOVERY_DIGEST ?? "on") === "on",
  };
}
