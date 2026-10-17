import { expect, it, vi } from "vitest";
import { deferTransientRecovery } from "./transient-retry";

it("bounds transient retries for the same item without resetting a later item's budget", async () => {
  const command = {
    state: "running",
    leaseId: "lease",
    result: [],
    input: {
      instance: "instance",
      items: [{ token: "t", version: "v", action: "recover_proof" }],
      retries: { "0": 2 },
    },
  };
  const update = vi.fn();
  const db = {
    $transaction: async (fn: (value: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn(),
        meteringRecoveryCommand: { findUniqueOrThrow: async () => command, update },
      }),
  };
  expect(await deferTransientRecovery(db as never, "n", "c", "lease", { code: "P2034" }, 0)).toBe(
    false,
  );
  expect(update).not.toHaveBeenCalled();
  command.result.push({} as never);
  expect(await deferTransientRecovery(db as never, "n", "c", "lease", { code: "P2034" }, 1)).toBe(
    true,
  );
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        input: expect.objectContaining({ retries: { "0": 2, "1": 1 } }),
      }),
    }),
  );
});
it("never retries a business or authorization error", async () => {
  const transaction = vi.fn();
  expect(
    await deferTransientRecovery(
      { $transaction: transaction } as never,
      "n",
      "c",
      "lease",
      new Error("authority missing"),
      0,
    ),
  ).toBe(false);
  expect(transaction).not.toHaveBeenCalled();
});

it("does not consume a retry for the next item after an ambiguous successful commit", async () => {
  const update = vi.fn();
  const db = {
    $transaction: async (fn: (value: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn(),
        meteringRecoveryCommand: {
          findUniqueOrThrow: async () => ({
            state: "running",
            leaseId: "lease",
            result: [{ status: "recovered" }],
          }),
          update,
        },
      }),
  };
  expect(await deferTransientRecovery(db as never, "n", "c", "lease", { code: "P1001" }, 0)).toBe(
    true,
  );
  expect(update).not.toHaveBeenCalled();
});
