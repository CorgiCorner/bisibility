import { describe, expect, it } from "vitest";
import { parseLocalSubmission } from "./submission";
import { acceptedTaskEnvelope, nativeIds, receiptTime } from "./test-fixtures";

describe("native acceptance and charge evidence", () => {
  it("retains accepted UUIDs independently from charged USD and existing cents receipt authority", () => {
    const outcome = parseLocalSubmission(acceptedTaskEnvelope(), true, 1, receiptTime);
    expect(outcome).toMatchObject({
      acceptance: "accepted",
      taskIds: [nativeIds[0]],
      envelopeCostUsd: 0.012,
      taskCharges: [{ taskId: nativeIds[0], statusCode: 20100, costUsd: 0.012 }],
      usage: { costCents: 1.2, failed: false },
    });
  });

  it("keeps a determinate mixed batch's accepted subset and all charged tasks without summing root plus tasks", () => {
    const response = {
      status_code: 20000,
      tasks_count: 2,
      cost: 0.05,
      tasks: [
        { id: nativeIds[0], status_code: 20100, cost: 0.03 },
        { id: nativeIds[1], status_code: 40001, cost: 0.02 },
      ],
    };
    const result = parseLocalSubmission(response, true, 2, receiptTime);
    expect(result.acceptance).toBe("accepted");
    expect(result.taskIds).toEqual([nativeIds[0]]);
    expect(result.usage).toMatchObject({ costCents: 5, failed: true });
    expect(result.taskCharges).toHaveLength(2);
    expect(result.taskCharges[1].costUsd).toBe(0.02);
  });

  it("retains a proven accepted subset when another task or batch count is uncertain", () => {
    const response = {
      status_code: 20000,
      cost: 0.05,
      tasks_count: 2,
      tasks: [
        { id: nativeIds[0], status_code: 20100, cost: 0.03 },
        { status_code: 50000, cost: 0.02 },
      ],
    };
    expect(parseLocalSubmission(response, true, 2, receiptTime)).toMatchObject({
      acceptance: "unknown",
      taskIds: [nativeIds[0]],
      usage: { costCents: 5 },
    });
    expect(parseLocalSubmission(acceptedTaskEnvelope(), true, 2, receiptTime)).toMatchObject({
      acceptance: "unknown",
      taskIds: [nativeIds[0]],
    });
  });

  it("never repairs malformed task IDs, duplicate acceptance or invalid cost into a new confident request", () => {
    const envelope = acceptedTaskEnvelope();
    expect(
      parseLocalSubmission(
        { ...envelope, tasks: [{ ...envelope.tasks[0], id: "secret:unsafe" }] },
        true,
        1,
        receiptTime,
      ),
    ).toMatchObject({
      acceptance: "unknown",
      taskIds: [],
      usage: { providerRequestId: undefined },
    });
    expect(
      parseLocalSubmission(
        { ...envelope, tasks_count: 2, tasks: [envelope.tasks[0], envelope.tasks[0]] },
        true,
        2,
        receiptTime,
      ),
    ).toMatchObject({ acceptance: "unknown", taskIds: [nativeIds[0]] });
    expect(
      parseLocalSubmission({ ...envelope, cost: "invalid" }, true, 1, receiptTime).usage.costCents,
    ).toBeNull();
    expect(
      parseLocalSubmission(
        { status_code: 20000, cost: 0, tasks_count: 1, tasks: [{ status_code: 40001, cost: 0 }] },
        true,
        1,
        receiptTime,
      ),
    ).toMatchObject({ acceptance: "rejected", taskIds: [], usage: { costCents: 0 } });
  });
});
