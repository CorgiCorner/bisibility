import { describe, expect, it } from "vitest";
import { evaluateCutoverQuiescence } from "./cutover-quiescence";

function snapshot(overrides = {}) {
  return {
    activeResultRetrieval: 0,
    appEnvironment: "production",
    appMode: "cutover" as const,
    appRelease: "sha-1",
    coverageExact: true,
    dispatcherRetired: true,
    dispatcherExecutions: 0,
    duplicatePaidEvidence: 0,
    inventoryAmbiguousCandidates: 0,
    inventoryInspectionFailures: 0,
    legacyStartsDuringObservation: 0,
    legacyVisibilityComplete: true,
    legacyVisibilitySamples: 3,
    migrationReady: true,
    observationSeconds: 120,
    opsErrorEvents: 0,
    ownedLegacySchedules: 0,
    providerFailures: 0,
    queuedAmbiguous: 0,
    queuedPrepared: 0,
    queuedSubmitted: 0,
    queuedSubmitting: 0,
    rankCheckExecutions: 0,
    reconcilerRetired: true,
    runningScheduledChecks: 0,
    runningScheduledCanInitiatePaidCall: 0,
    schedulerBaselineCount: 9,
    schedulerExpectedFinalCount: 7,
    schedulerExpectedRetirementDelta: 2,
    schedulerVisibilityComplete: true,
    schedulerVisibilitySamples: [7, 7, 7],
    schedulerVisibilityStable: true,
    staleRunningChecks: 0,
    taskQueueBacklog: 0,
    totalSchedulerWorkflows: 7,
    unrelatedSchedulesConserved: true,
    workerMode: "cutover" as const,
    workerEnvironment: "production",
    workerHeartbeatState: "fresh" as const,
    workerRelease: "sha-1",
    workerHeartbeatFresh: true,
    workerSchemaReady: true,
    ...overrides,
  };
}

describe("evaluateCutoverQuiescence", () => {
  it("passes only the exact cutover state while conserving global schedulers", () => {
    expect(evaluateCutoverQuiescence(snapshot())).toEqual({
      reasons: [],
      verdict: "PASS",
    });
  });

  it.each([1, 999])(
    "rejects global scheduler count %s when it violates the checkpoint equation",
    (totalSchedulerWorkflows) => {
      const result = evaluateCutoverQuiescence(snapshot({ totalSchedulerWorkflows }));
      expect(result.verdict).toBe("FAIL");
      expect(result.reasons).toContain("global-scheduler-conservation");
    },
  );

  it("requires complete inventory and fresh worker evidence", () => {
    const result = evaluateCutoverQuiescence(
      snapshot({
        inventoryAmbiguousCandidates: 1,
        inventoryInspectionFailures: 1,
        workerHeartbeatFresh: false,
        workerHeartbeatState: "stale",
      }),
    );
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "ambiguous-rank-check-schedules",
        "schedule-inspection-failed",
        "worker-heartbeat-stale",
      ]),
    );
  });

  it.each([
    ["absent", "worker-heartbeat-absent"],
    ["future", "worker-heartbeat-future"],
    ["invalid", "worker-heartbeat-invalid"],
    ["stale", "worker-heartbeat-stale"],
  ] as const)("distinguishes %s worker heartbeat evidence", (workerHeartbeatState, reason) => {
    const result = evaluateCutoverQuiescence(
      snapshot({ workerHeartbeatFresh: false, workerHeartbeatState }),
    );
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons).toContain(reason);
  });

  it("distinguishes worker environment skew", () => {
    const result = evaluateCutoverQuiescence(snapshot({ workerEnvironment: "preview" }));
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons).toContain("worker-environment");
  });

  it("returns incomplete when bounded Temporal visibility never stabilizes", () => {
    const result = evaluateCutoverQuiescence(
      snapshot({ legacyVisibilityComplete: false, legacyVisibilitySamples: 2 }),
    );
    expect(result.verdict).toBe("INCOMPLETE");
    expect(result.reasons).toContain("legacy-visibility-incomplete");
  });

  it("returns incomplete when the first scheduler count matches and later samples diverge", () => {
    const result = evaluateCutoverQuiescence(
      snapshot({
        schedulerVisibilityComplete: false,
        schedulerVisibilitySamples: [7, 8, 7],
        schedulerVisibilityStable: false,
      }),
    );
    expect(result.verdict).toBe("INCOMPLETE");
    expect(result.reasons).toContain("scheduler-visibility-incomplete");
  });

  it("passes with three consecutive exact scheduler-count samples", () => {
    expect(
      evaluateCutoverQuiescence(
        snapshot({
          schedulerVisibilityComplete: true,
          schedulerVisibilitySamples: [8, 7, 7, 7],
          schedulerVisibilityStable: true,
        }),
      ).verdict,
    ).toBe("PASS");
  });

  it("does not trust a complete flag without three exact scheduler samples", () => {
    const result = evaluateCutoverQuiescence(
      snapshot({
        schedulerVisibilityComplete: true,
        schedulerVisibilitySamples: [7],
      }),
    );
    expect(result.verdict).toBe("INCOMPLETE");
    expect(result.reasons).toContain("scheduler-visibility-incomplete");
  });

  it("rejects release skew, unsubmitted batches, paid-call risk, and duplicates", () => {
    const result = evaluateCutoverQuiescence(
      snapshot({
        duplicatePaidEvidence: 1,
        queuedPrepared: 1,
        runningScheduledCanInitiatePaidCall: 1,
        workerRelease: "sha-2",
      }),
    );
    expect(result.verdict).toBe("FAIL");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "release-parity",
        "unsubmitted-queued-batches",
        "scheduled-paid-call-risk",
        "duplicate-paid-evidence",
      ]),
    );
  });

  it("requires the full observation interval and zero new legacy starts", () => {
    expect(
      evaluateCutoverQuiescence(
        snapshot({ legacyStartsDuringObservation: 1, observationSeconds: 60 }),
      ).reasons,
    ).toEqual(expect.arrayContaining(["observation-too-short", "new-legacy-starts"]));
  });

  it("requires both automatic singleton owners to be retired", () => {
    expect(
      evaluateCutoverQuiescence(snapshot({ dispatcherRetired: false, reconcilerRetired: false }))
        .reasons,
    ).toEqual(expect.arrayContaining(["dispatcher-singleton-retirement", "reconciler-retirement"]));
  });

  it("allows a small explained backlog but rejects an unexplained one", () => {
    expect(
      evaluateCutoverQuiescence(snapshot({ taskQueueBacklog: 5 }), {
        backlogBound: 25,
      }).reasons,
    ).toContain("task-queue-backlog");
    expect(
      evaluateCutoverQuiescence(snapshot({ taskQueueBacklog: 5 }), {
        backlogBound: 25,
        backlogExplanation: "five already-paid result activities",
      }).verdict,
    ).toBe("PASS");
  });

  it("waits for already-submitted result retrieval instead of cancelling it", () => {
    expect(evaluateCutoverQuiescence(snapshot({ activeResultRetrieval: 2 })).reasons).toContain(
      "active-paid-result-retrieval",
    );
  });
});
