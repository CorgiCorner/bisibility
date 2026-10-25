import { describe, expect, it } from "vitest";
import { type RecoveryStartInput, recoveryStartDecision, recoveryWriteGateOpen } from "./predicate";

const now = new Date("2026-10-24T12:00:00Z");
const live: RecoveryStartInput = {
  operationState: "dispatch_intended",
  transportFenced: true,
  stopReason: "workflow_failed",
  queued: false,
  queueDeadlineAt: null,
  pollingStoppedAt: null,
  acceptance: "unconfirmed",
  fulfillment: "absent",
  accounting: "unknown",
};
describe("RE-1 RE-3 independent start dimensions", () => {
  it.each([
    ["released", { operationState: "released" }, "released"],
    ["unfenced failed workflow", { transportFenced: false }, "unfenced_operator_only"],
    [
      "unfenced cancelled workflow",
      { transportFenced: false, stopReason: "workflow_cancelled" },
      "unfenced_operator_only",
    ],
    ["in flight fenced", { stopReason: null }, "waiting_for_attempt_end"],
    [
      "activity timeout retries remaining",
      { stopReason: "activity_timeout" },
      "waiting_for_attempt_end",
    ],
    [
      "fenced measured success",
      { acceptance: "accepted", fulfillment: "complete", accounting: "measured" },
      "not_needed",
    ],
    [
      "known ID measured partial",
      { acceptance: "accepted", fulfillment: "partial", accounting: "measured" },
      "enqueue",
    ],
    [
      "accounting unresolved",
      { acceptance: "accepted", fulfillment: "complete", accounting: "unknown" },
      "enqueue",
    ],
    ["nonretryable fenced", { stopReason: "non_retryable" }, "enqueue"],
    ["exhausted fenced", { stopReason: "retries_exhausted" }, "enqueue"],
    [
      "cancelled live immediate",
      { stopReason: "workflow_cancelled", queueDeadlineAt: new Date(now.getTime() + 3600000) },
      "enqueue",
    ],
    ["completed unresolved", { stopReason: "workflow_completed" }, "enqueue"],
    [
      "unfenced queued at deadline",
      { queued: true, transportFenced: false, queueDeadlineAt: now, pollingStoppedAt: now },
      "unfenced_operator_only",
    ],
  ] as const)("%s", (_name, patch, expected) => {
    expect(recoveryStartDecision({ ...live, ...patch }, now)).toBe(expected);
  });
  it.each([3600, 1234])(
    "honors the operation's own %is queue deadline and stopped polling",
    (seconds) => {
      const startedAt = new Date(now.getTime() - seconds * 1000);
      const queueDeadlineAt = new Date(startedAt.getTime() + seconds * 1000);
      const input = { ...live, queued: true, queueDeadlineAt, pollingStoppedAt: now };
      expect(recoveryStartDecision(input, new Date(now.getTime() - 1))).toBe(
        "waiting_for_queue_deadline",
      );
      expect(recoveryStartDecision({ ...input, pollingStoppedAt: null }, now)).toBe(
        "waiting_for_queue_deadline",
      );
      expect(recoveryStartDecision(input, now)).toBe("enqueue");
    },
  );
});
it("write gate: workflow completion and fence do not acknowledge original ownership", () => {
  expect(
    recoveryWriteGateOpen({ completionAcknowledgedAt: null, ownershipSupersededAt: null }),
  ).toBe(false);
  expect(
    recoveryWriteGateOpen({ completionAcknowledgedAt: now, ownershipSupersededAt: null }),
  ).toBe(true);
  expect(
    recoveryWriteGateOpen({ completionAcknowledgedAt: null, ownershipSupersededAt: now }),
  ).toBe(true);
});
