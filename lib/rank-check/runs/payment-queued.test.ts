import { beforeEach, expect, it, vi } from "vitest";
import { queuedRankPaymentLimit, queuedRankPaymentSessions } from "./payment-queued";

const mock = vi.hoisted(() => ({ execution: vi.fn(), retained: vi.fn() }));
vi.mock("./payment-runtime", () => ({
  rankPaymentExecution: mock.execution,
  retainedRankPayment: mock.retained,
}));
beforeEach(() => vi.clearAllMocks());
it("preserves queued definition fencing and adds exact payer checks at reserve and dispatch", async () => {
  const calls: string[] = [];
  const session = {
    binding: {},
    beforeReserve: {
      lockBusiness: async () => {
        calls.push("definition-lock");
      },
      assertRequest: async () => {
        calls.push("definition-reserve");
      },
    },
    beforeFence: {
      lockBusiness: async () => {
        calls.push("definition-fence-lock");
      },
      assertDispatch: async () => {
        calls.push("definition-fence");
      },
    },
  };
  mock.execution.mockResolvedValue({
    payment: {
      guard: {
        lockBusiness: async () => {
          calls.push("payment-lock");
        },
        assertRequest: async () => {
          calls.push("payment-check");
        },
      },
    },
  });
  const result = await queuedRankPaymentSessions(
    {
      projectId: "project",
      connection: { id: "conn" },
      tasks: [{ id: "task", rankCheckId: "check" }],
    } as never,
    new Map([["task", session]]) as never,
  );
  const composed = result.get("task")!;
  await composed.beforeReserve.lockBusiness({} as never, "operation");
  await composed.beforeReserve.assertRequest({} as never, "operation");
  await composed.beforeFence.assertDispatch(
    {} as never,
    [{ operation: { operationId: "operation" } }] as never,
  );
  expect(calls).toEqual([
    "definition-lock",
    "payment-lock",
    "definition-reserve",
    "payment-check",
    "definition-fence",
    "payment-check",
  ]);
});
it("caps queued USD in cents without interpreting native units as currency", async () => {
  mock.retained.mockResolvedValue({
    consent: { option: { fundingSource: "byok", payableUnit: { kind: "currency", code: "USD" } } },
    target: { amount: "0.012" },
  });
  await expect(queuedRankPaymentLimit("check")).resolves.toBe("1.2");
  mock.retained.mockResolvedValue({
    consent: {
      option: { fundingSource: "byok", payableUnit: { kind: "provider_native", key: "searches" } },
    },
    target: { amount: "2" },
  });
  await expect(queuedRankPaymentLimit("check")).resolves.toBeUndefined();
});
