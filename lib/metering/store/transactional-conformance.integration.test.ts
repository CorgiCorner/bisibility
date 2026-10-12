import type { Store } from "@usagekit/store";
import { runStoreConformance } from "@usagekit/store/conformance";
import { afterAll, expect, test } from "vitest";
import { Prisma } from "./sql";
import { closeConformanceFixturePool, createConformanceFixture } from "./test-fixture";
import { createTransactionBoundStore } from "./transactional";

async function transactionFixture() {
  const f = await createConformanceFixture();
  const store = new Proxy({} as Store, {
    get(_target, key: keyof Store) {
      if (typeof f.store[key] !== "function") return undefined;
      return async (...args: unknown[]) => {
        // Apply the published fixture's mutable budgets before opening the host transaction.
        await f.syncBudgets();
        return f.client().$transaction(async (tx) => {
          await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
          const bound = await createTransactionBoundStore({ transaction: tx, clock: f.clock });
          return Reflect.apply(bound[key], bound, args);
        });
      };
    },
  });
  return {
    ...f,
    store,
    restart: async () => {
      await f.restart();
      return store;
    },
  };
}

test("the transaction-bound store is non-thenable on reopen", async () => {
  const f = await transactionFixture();
  try {
    expect(Reflect.get(f.store, "then")).toBeUndefined();
  } finally {
    await f.close();
  }
});

runStoreConformance(transactionFixture, {
  durable: true,
  rollingWindows: false,
  maxMoneyUnits: 2n ** 63n - 1n,
  maxQuantityScale: 18,
});

afterAll(closeConformanceFixturePool);
