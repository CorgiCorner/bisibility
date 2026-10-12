import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), cancel: vi.fn(), proof: vi.fn(), tx: {} }));
vi.mock("@/lib/metering/usage-read", () => ({ readCanonicalUsage: mocks.read }));
vi.mock("@/lib/metering/cancel-paid-attempt", () => ({ cancelUnsentPaidAttempt: mocks.cancel }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: async (body: (tx: unknown) => unknown) => body(mocks.tx) },
}));

import { settleLateNoDispatch, settleNoDispatch } from "./no-dispatch-settlement";

const scope = { projectId: "p", connectionId: "c", tags: ["tag"] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue([{ id: "op", namespace: "n", principal: "owner", tag: "tag" }]);
});
test("no-send evidence cancels the original Store operation in the same transaction", async () => {
  await settleNoDispatch(scope);
  expect(mocks.cancel).toHaveBeenCalledWith(mocks.tx, {
    namespace: "n",
    principal: "owner",
    operationId: "op",
  });
  expect(mocks.read.mock.calls[0][0].values).toEqual(["p", "c", "tag"]);
});
test("a retained transport fence refuses cancellation and propagates failure", async () => {
  mocks.cancel.mockRejectedValue(new Error("Possible paid acceptance cannot be cancelled as zero"));
  await expect(settleNoDispatch(scope)).rejects.toThrow("Possible paid acceptance");
});
test("late cancellation needs matching trusted producer proof", async () => {
  const tx = { agentReport: { findFirst: mocks.proof } };
  mocks.proof.mockResolvedValue(null);
  await expect(settleLateNoDispatch(tx as never, "p", "c")).resolves.toEqual([]);
  expect(mocks.cancel).not.toHaveBeenCalled();
  mocks.proof.mockResolvedValue({ id: "report" });
  await expect(settleLateNoDispatch(tx as never, "p", "c")).resolves.toEqual(["op"]);
});
