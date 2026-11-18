import { expect, it, vi } from "vitest";
import type { ModelPaymentDatabase } from "./admission-storage";
import { modelPaymentTransaction } from "./payment-transaction";

it.each([
  { code: "P2034" },
  { code: "40001" },
  { code: "P2010", meta: { code: "40001" } },
  { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "40001" } } } },
])("restarts only a rolled-back serialization failure: %j", async (failure) => {
  const transaction = vi
    .fn()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce("retained-attempt");
  expect(
    await modelPaymentTransaction(
      { $transaction: transaction } as unknown as ModelPaymentDatabase,
      async () => "unused",
    ),
  ).toBe("retained-attempt");
  expect(transaction).toHaveBeenCalledTimes(2);
});
it("does not retry an indeterminate commit or storage failure", async () => {
  const transaction = vi.fn().mockRejectedValue(new Error("Commit result lost"));
  await expect(
    modelPaymentTransaction(
      { $transaction: transaction } as unknown as ModelPaymentDatabase,
      async () => "unused",
    ),
  ).rejects.toThrow("Commit result lost");
  expect(transaction).toHaveBeenCalledTimes(1);
});

it.each(["08006", "57P01", "23505"])(
  "does not retry a non-serialization driver failure %s",
  async (originalCode) => {
    const failure = { code: "P2010", meta: { driverAdapterError: { cause: { originalCode } } } };
    const transaction = vi.fn().mockRejectedValue(failure);
    await expect(
      modelPaymentTransaction(
        { $transaction: transaction } as unknown as ModelPaymentDatabase,
        async () => "unused",
      ),
    ).rejects.toEqual(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  },
);
