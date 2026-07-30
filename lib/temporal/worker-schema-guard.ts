import type { MigrationComparison } from "../db/migration-state";

export type WorkerSchemaGuardMode = "enforce" | "off" | "warn";

export type WorkerSchemaGuardDecision = {
  block: boolean;
  check: boolean;
  logLevel: "error" | "info" | "warning" | null;
  notify: boolean;
};

export function workerSchemaGuardMode(value: string | undefined): WorkerSchemaGuardMode {
  return value === "off" || value === "warn" || value === "enforce" ? value : "enforce";
}

export function decideWorkerSchemaGuard(
  mode: WorkerSchemaGuardMode,
  comparison: MigrationComparison,
): WorkerSchemaGuardDecision {
  if (mode === "off") {
    return { block: false, check: false, logLevel: null, notify: false };
  }
  if (comparison === "worker-behind") {
    return {
      block: mode === "enforce",
      check: true,
      logLevel: "error",
      notify: true,
    };
  }
  if (comparison === "worker-ahead") {
    return {
      block: false,
      check: true,
      logLevel: "warning",
      notify: mode === "warn",
    };
  }
  return { block: false, check: true, logLevel: "info", notify: false };
}
