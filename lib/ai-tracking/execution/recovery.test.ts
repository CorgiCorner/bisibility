import { TrackingResponseCaptureError } from "@/lib/ai-tracking/providers/dispatch-error";
import type { TrackingEnvelope } from "@/lib/ai-tracking/providers/envelope";
import { receiptOperationId } from "@/lib/metering/operation-reference";
import { expect, it, vi } from "vitest";
import { samplePlan } from "./fixture";
import type { ExecutableSample, TrackingExecutionPorts } from "./ports";
import { executeTrackingSample } from "./sample";

function recoveryPorts() {
  const plan = samplePlan();
  const row: ExecutableSample = {
    plan,
    dispatch: "planned",
    providerTaskId: null,
    receipt: null,
    cancelled: false,
  };
  const envelope: TrackingEnvelope = {
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        id: "task",
        cost: 0,
        result: [{ money_spent: 0.003, items: [{ text: "Answer" }] }],
      },
    ],
  };
  const ledger = new Map<string, string | null>();
  const submit = vi.fn(async () => ({
    status_code: 20000,
    tasks: [{ status_code: 20100, id: "task", cost: 0.0102 }],
  }));
  const ports: TrackingExecutionPorts = {
    load: async () => ({ ...row }),
    claim: async () => {
      row.dispatch = "claimed";
      return true;
    },
    transition: async (_plan, expected, next, taskId, receipt) => {
      if (row.dispatch !== expected) return false;
      row.dispatch = next;
      if (taskId) row.providerTaskId = taskId;
      if (receipt) row.receipt = receipt;
      return true;
    },
    prepare: async () => ({
      observer: {
        begin: async () => {
          ledger.set("ledger", null);
          return "ledger";
        },
        settle: async () => undefined,
      },
      submit,
    }),
    collect: vi.fn(async () => envelope),
    settle: vi.fn(async (_plan, receipt) => {
      ledger.set(receiptOperationId(receipt) ?? "missing", receipt.amountUsd);
    }),
    persist: vi.fn(async () => {
      row.dispatch = "terminal";
      return true;
    }),
  };
  return { row, ledger, ports, submit };
}
it("retains one provider task through three pending GETs and one successful collection", async () => {
  const test = recoveryPorts();
  await executeTrackingSample(test.ports, "project", "sample");
  vi.mocked(test.ports.collect)
    .mockResolvedValueOnce({ status_code: 20000, tasks: [{ status_code: 40601 }] })
    .mockResolvedValueOnce({ status_code: 20000, tasks: [{ status_code: 40601 }] })
    .mockResolvedValueOnce({ status_code: 20000, tasks: [{ status_code: 40601 }] });
  for (let index = 0; index < 4; index++)
    await executeTrackingSample(test.ports, "project", "sample");
  expect(test.submit).toHaveBeenCalledTimes(1);
  expect(test.ports.collect).toHaveBeenCalledTimes(4);
  expect(test.ports.persist).toHaveBeenCalledTimes(1);
  expect(test.ports.settle).toHaveBeenCalledTimes(2);
  expect(test.ledger).toEqual(new Map([["ledger", "0.0032"]]));
});
it("restarts after ledger settlement before result persistence using GET and the original ledger", async () => {
  const test = recoveryPorts();
  await executeTrackingSample(test.ports, "project", "sample");
  vi.mocked(test.ports.persist).mockRejectedValueOnce(
    new Error("worker terminated before result persistence"),
  );
  await expect(executeTrackingSample(test.ports, "project", "sample")).rejects.toThrow(
    /terminated/,
  );
  expect(test.row.dispatch).toBe("collecting");
  await executeTrackingSample(test.ports, "project", "sample");
  expect(test.submit).toHaveBeenCalledTimes(1);
  expect(test.ports.collect).toHaveBeenCalledTimes(2);
  expect(test.ledger.size).toBe(1);
  expect(test.ledger.get("ledger")).toBe("0.0032");
  expect(test.row.dispatch).toBe("terminal");
});

it("keeps a purchased task and its cost when response archiving fails", async () => {
  const test = recoveryPorts();
  const envelope = await test.submit();
  test.submit.mockClear();
  const error = new TrackingResponseCaptureError(envelope, new Error("archive unavailable"));
  test.submit.mockRejectedValueOnce(error);
  await expect(executeTrackingSample(test.ports, "project", "sample")).rejects.toBe(error);
  expect(test.row.dispatch).toBe("submission_unknown");
  expect(test.row.providerTaskId).toBe("task");
  expect(test.row.receipt?.amountUsd).toBe("0.0102");
  expect(test.ledger.get("ledger")).toBe("0.0102");
  await executeTrackingSample(test.ports, "project", "sample");
  expect(test.submit).toHaveBeenCalledTimes(1);
  expect(test.ports.collect).toHaveBeenCalledTimes(1);
  expect(test.row.dispatch).toBe("terminal");
});
it("retains known GET cost and retries collection instead of paid submission after archive failure", async () => {
  const test = recoveryPorts();
  await executeTrackingSample(test.ports, "project", "sample");
  const response = await test.ports.collect(test.row.plan, "task");
  vi.mocked(test.ports.collect).mockClear();
  vi.mocked(test.ports.collect).mockRejectedValueOnce(
    new TrackingResponseCaptureError(response, new Error("archive unavailable")),
  );
  await expect(executeTrackingSample(test.ports, "project", "sample")).rejects.toThrow(/archived/);
  expect(test.row.providerTaskId).toBe("task");
  expect(test.row.receipt?.amountUsd).toBe("0.0032");
  expect(test.ledger.get("ledger")).toBe("0.0032");
  await executeTrackingSample(test.ports, "project", "sample");
  expect(test.submit).toHaveBeenCalledTimes(1);
  expect(test.ports.collect).toHaveBeenCalledTimes(2);
  expect(test.row.dispatch).toBe("terminal");
});
