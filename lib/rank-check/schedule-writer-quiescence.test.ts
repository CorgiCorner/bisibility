import { describe, expect, it } from "vitest";
import {
  evaluateScheduleWriterQuiescence,
  type ScheduleWriterQuiescenceEvidence,
} from "./schedule-writer-quiescence";

function evidence(
  overrides: Partial<ScheduleWriterQuiescenceEvidence> = {},
): ScheduleWriterQuiescenceEvidence {
  return {
    appEnvironment: "production",
    appMigrationReady: true,
    appMode: "cutover",
    appRelease: "release-a",
    credentialsExclusive: true,
    dispatcherRetired: true,
    inventoryAmbiguousCandidates: 0,
    inventoryInspectionFailures: 0,
    localMigrationReady: true,
    operationLeaseHeld: true,
    reconcilerRetired: true,
    workerEnvironment: "production",
    workerHeartbeatState: "fresh",
    workerMode: "cutover",
    workerRelease: "release-a",
    workerSchemaReady: true,
    ...overrides,
  };
}

describe("Schedule writer quiescence", () => {
  it("accepts mutation only after every writer-quiescence precondition", () => {
    expect(evaluateScheduleWriterQuiescence(evidence())).toEqual({
      evidence: evidence(),
      ready: true,
      reasons: [],
    });
  });

  it.each([
    [{ appRelease: "release-b" }, "release-parity"],
    [{ workerMode: "legacy" }, "effective-mode"],
    [{ workerEnvironment: "preview" }, "worker-environment"],
    [{ workerHeartbeatState: "future" }, "worker-heartbeat-future"],
    [{ workerSchemaReady: false }, "worker-schema"],
    [{ reconcilerRetired: false }, "reconciler-not-retired"],
    [{ dispatcherRetired: false }, "dispatcher-not-retired"],
    [{ operationLeaseHeld: false }, "operation-lease-not-held"],
    [{ credentialsExclusive: false }, "temporal-credentials-not-exclusive"],
  ] as const)("fails closed for %s", (overrides, reason) => {
    const result = evaluateScheduleWriterQuiescence(evidence(overrides));
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain(reason);
  });
});
