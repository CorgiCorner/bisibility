import { expect, it, vi } from "vitest";
import {
  type ModelPlaygroundDatabase,
  type ModelPlaygroundTransaction,
  storeTransaction,
} from "./store-db";

it("forwards the same transaction callback without adding session or isolation options", async () => {
  const tx: ModelPlaygroundTransaction = { $queryRawUnsafe: vi.fn() };
  const work = vi.fn(async (transaction: ModelPlaygroundTransaction) => {
    expect(transaction).toBe(tx);
    return "committed";
  });
  const db: ModelPlaygroundDatabase = { $transaction: async (callback) => callback(tx) };
  const transaction = vi.spyOn(db, "$transaction");
  expect(await storeTransaction(db, work)).toBe("committed");
  expect(transaction.mock.calls).toEqual([[work]]);
  expect(work).toHaveBeenCalledOnce();
});
