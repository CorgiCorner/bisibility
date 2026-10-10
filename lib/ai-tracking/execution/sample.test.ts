import type { CostReceipt, DispatchState } from "@/lib/ai-tracking/contract";
import type { TrackingEnvelope } from "@/lib/ai-tracking/providers/envelope";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { describe, expect, it, vi } from "vitest";
import { samplePlan } from "./fixture";
import { TrackingDispatchDeniedError, type TrackingExecutionPorts } from "./ports";
import { executeTrackingSample } from "./sample";

function harness(initial: DispatchState = "planned") {
  const plan = samplePlan();
  let dispatch = initial;
  let taskId: string | null = initial === "submitted" ? "provider-task" : null;
  let receipt: CostReceipt | null = taskId
    ? { providerCostEntryId: "ledger", amountUsd: "0.0102", state: "refund_pending" }
    : null;
  let cancelled = false;
  const submit = vi.fn(
    async (): Promise<TrackingEnvelope> => ({
      status_code: 20000,
      tasks: [{ status_code: 20100, id: "provider-task", cost: 0.0102 }],
    }),
  );
  const begin = vi.fn(async () => "ledger");
  const ports: TrackingExecutionPorts = {
    load: vi.fn(async () => ({ plan, dispatch, providerTaskId: taskId, receipt, cancelled })),
    claim: vi.fn(async () => {
      if (dispatch !== "planned") return false;
      dispatch = "claimed";
      return true;
    }),
    transition: vi.fn(async (_plan, expected, next, id, nextReceipt) => {
      if (dispatch !== expected) return false;
      dispatch = next;
      if (id) taskId = id;
      if (nextReceipt) receipt = nextReceipt;
      return true;
    }),
    prepare: vi.fn(async () => ({
      observer: {
        begin,
        beforeDispatch: vi.fn(async () => undefined),
        settle: vi.fn(async () => undefined),
        cancel: vi.fn(async () => undefined),
      },
      submit,
    })),
    collect: vi.fn(async () => ({
      status_code: 20000,
      tasks: [
        {
          id: "provider-task",
          status_code: 20000,
          cost: 0,
          result: [
            { money_spent: 0.003, items: [{ type: "message", sections: [{ text: "Answer" }] }] },
          ],
        },
      ],
    })),
    settle: vi.fn(async () => undefined),
    persist: vi.fn(async () => {
      if (dispatch === "terminal") return false;
      dispatch = "terminal";
      return true;
    }),
  };
  return {
    plan,
    ports,
    submit,
    begin,
    cancel: () => {
      cancelled = true;
    },
    dispatch: () => dispatch,
  };
}
describe("durable tracking execution", () => {
  it("concurrent workers win one claim and send one POST", async () => {
    const test = harness();
    await Promise.all([
      executeTrackingSample(test.ports, "project", "sample"),
      executeTrackingSample(test.ports, "project", "sample"),
    ]);
    expect(test.submit).toHaveBeenCalledTimes(1);
    expect(test.dispatch()).toBe("submitted");
    expect(test.ports.transition).toHaveBeenCalledWith(
      test.plan,
      "claimed",
      "submission_started",
      undefined,
      { providerCostEntryId: "ledger", amountUsd: null, state: "unknown" },
    );
  });
  it("ambiguous response becomes submission_unknown and never replays POST", async () => {
    const test = harness();
    test.submit.mockRejectedValueOnce(new TypeError("connection lost"));
    expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("submission_unknown");
    expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("submission_unknown");
    expect(test.submit).toHaveBeenCalledTimes(1);
  });
  it("crash after submission_started is recovered as unknown without POST", async () => {
    const test = harness("submission_started");
    expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("submission_unknown");
    expect(test.submit).not.toHaveBeenCalled();
  });
  it("crash after journal begin blocks a second paid attempt", async () => {
    const test = harness("claimed");
    test.begin.mockRejectedValueOnce(
      new ProviderUsagePersistenceError({ attemptId: "ledger", phase: "admission" }),
    );
    expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("submission_unknown");
    expect(test.submit).not.toHaveBeenCalled();
  });
  it("known task cancellation still collects and settles purchased work once", async () => {
    const test = harness("submitted");
    test.cancel();
    expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("terminal");
    expect(test.ports.settle).toHaveBeenCalledWith(
      test.plan,
      { providerCostEntryId: "ledger", amountUsd: "0.0032", state: "derived" },
      false,
      "provider-task",
    );
    await executeTrackingSample(test.ports, "project", "sample");
    expect(test.ports.collect).toHaveBeenCalledTimes(1);
    expect(test.ports.settle).toHaveBeenCalledTimes(1);
    expect(test.submit).not.toHaveBeenCalled();
  });
  it("cancellation before dispatch prevents the paid transport", async () => {
    const test = harness();
    test.cancel();
    expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("blocked");
    expect(test.submit).not.toHaveBeenCalled();
  });
  it.each(["Tracking run is cancelled.", "Actor membership was revoked."])(
    "known last-moment denial proves zero usage: %s",
    async (message) => {
      const test = harness();
      const settle = vi.fn(async () => undefined);
      vi.mocked(test.ports.prepare).mockResolvedValueOnce({
        observer: { begin: test.begin, settle },
        submit: async () => {
          throw new TrackingDispatchDeniedError(new Error(message));
        },
      });
      expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("blocked");
      expect(settle).toHaveBeenCalledWith("ledger", {
        cached: false,
        costCents: 0,
        quantity: 0,
        failed: true,
      });
      expect(test.ports.persist).toHaveBeenCalledWith(
        test.plan,
        expect.objectContaining({
          measurement: "unavailable",
          receipt: { providerCostEntryId: "ledger", amountUsd: "0", state: "confirmed" },
        }),
      );
      expect(test.submit).not.toHaveBeenCalled();
    },
  );
  it("task failure inside HTTP success persists failed measurement distinctly", async () => {
    const test = harness();
    test.submit.mockResolvedValueOnce({
      status_code: 20000,
      tasks: [{ status_code: 40001, cost: 0 }],
    });
    await executeTrackingSample(test.ports, "project", "sample");
    expect(test.ports.persist).toHaveBeenCalledWith(
      test.plan,
      expect.objectContaining({ measurement: "failed" }),
    );
  });
  it("a lost result CAS is deferred after idempotent ledger settlement", async () => {
    const test = harness("submitted");
    vi.mocked(test.ports.persist).mockResolvedValueOnce(false);
    expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("deferred");
  });
  it("admission failures finish unavailable with zero proven cost before POST", async () => {
    const test = harness();
    vi.mocked(test.ports.prepare).mockRejectedValueOnce(new Error("stale credentials"));
    expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("blocked");
    expect(test.ports.persist).toHaveBeenCalledWith(
      test.plan,
      expect.objectContaining({
        measurement: "unavailable",
        receipt: { providerCostEntryId: null, amountUsd: "0", state: "confirmed" },
      }),
    );
    expect(test.submit).not.toHaveBeenCalled();
  });
  it.each([
    ["Fresh official model prices are unavailable.", "unsupported_or_unpriced_model"],
    ["Provider budget allocation exhausted.", "budget_exhausted"],
  ])("distinguishes zero-spend admission failures: %s", async (message, reason) => {
    const test = harness();
    vi.mocked(test.ports.prepare).mockRejectedValueOnce(new Error(message));
    expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("blocked");
    expect(test.begin).not.toHaveBeenCalled();
    expect(test.submit).not.toHaveBeenCalled();
    expect(test.ports.persist).toHaveBeenCalledWith(
      test.plan,
      expect.objectContaining({ evidence: expect.objectContaining({ providerStatus: reason }) }),
    );
  });
  it("credential rotation for a submitted task retains its pending refund without another POST", async () => {
    const test = harness("submitted");
    vi.mocked(test.ports.collect).mockRejectedValueOnce(
      new Error("Purchased task credential changed; reconcile with the original account."),
    );
    await expect(executeTrackingSample(test.ports, "project", "sample")).rejects.toThrow(
      /credential changed/,
    );
    const retained = await test.ports.load("project", "sample");
    expect(retained?.providerTaskId).toBe("provider-task");
    expect(retained?.receipt).toEqual({
      providerCostEntryId: "ledger",
      amountUsd: "0.0102",
      state: "refund_pending",
    });
    expect(test.submit).not.toHaveBeenCalled();
    expect(test.ports.settle).not.toHaveBeenCalled();
  });
  it("persists backoff after a failed GET and replacement workers honor the retained poll time", async () => {
    const test = harness("submitted");
    let nextPollAt: string | null = null;
    const originalLoad = test.ports.load;
    test.ports.load = async (...args) => {
      const row = await originalLoad(...args);
      if (!row) throw new Error("Fixture row is missing.");
      return { ...row, nextPollAt };
    };
    test.ports.deferPoll = vi.fn(async () => {
      nextPollAt = new Date(Date.now() + 30_000).toISOString();
    });
    vi.mocked(test.ports.collect).mockRejectedValueOnce(new Error("Temporary GET failure"));
    await expect(executeTrackingSample(test.ports, "project", "sample")).rejects.toThrow(
      "Temporary GET failure",
    );
    expect(test.ports.deferPoll).toHaveBeenCalledTimes(1);
    expect(await executeTrackingSample(test.ports, "project", "sample")).toBe("collecting");
    expect(test.ports.collect).toHaveBeenCalledTimes(1);
    test.cancel();
    expect(
      await executeTrackingSample(test.ports, "project", "sample", { forceCollection: true }),
    ).toBe("terminal");
    expect(test.ports.collect).toHaveBeenCalledTimes(2);
    expect(test.submit).not.toHaveBeenCalled();
  });
});
