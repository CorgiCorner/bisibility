import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { beforeEach, expect, it, vi } from "vitest";
import { TASKSET_TRANSACTION_OPTIONS } from "./taskset-timeouts";
import { runAcceptedTasksetWrite, runUnsentTasksetTransaction } from "./taskset-transaction";

const pause = vi.hoisted(() => vi.fn(async (_delay: number) => undefined));
vi.mock("node:timers/promises", () => ({ setTimeout: pause }));
beforeEach(() => pause.mockClear());

function database(body: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  const transaction = vi.fn(body);
  const db = {
    $transaction: vi.fn(async (callback: typeof body) => callback({} as Prisma.TransactionClient)),
  };
  return {
    transaction,
    db,
    run: () => runUnsentTasksetTransaction(db as unknown as PrismaClient, transaction),
  };
}

it.each([
  { code: "P2034" },
  { code: "40P01" },
  { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "40001" } } } },
  { code: "P2028", meta: { operation: "query", timeout: 30_000, timeTaken: 30_010 } },
])("retries a confirmed aborted transaction: %j", async (failure) => {
  const f = database(async () => "admitted");
  f.transaction.mockRejectedValueOnce(failure);
  await expect(f.run()).resolves.toBe("admitted");
  expect(f.db.$transaction).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledWith(250);
});

it("bounds repeated conflicts to three attempts with backoff outside the transaction", async () => {
  const failure = { code: "P2034" };
  const f = database(async () => {
    throw failure;
  });
  await expect(f.run()).rejects.toBe(failure);
  expect(f.db.$transaction).toHaveBeenCalledTimes(3);
  expect(pause.mock.calls).toEqual([[250], [500]]);
});

it.each([
  { code: "P2028" },
  { code: "P2002" },
  { code: "P2021" },
  { code: "ECONNRESET" },
  new ProviderUsagePersistenceError({ phase: "admission" }),
])("does not replay an unproven rollback, schema error, or account refusal: %j", async (error) => {
  const f = database(async () => {
    throw error;
  });
  await expect(f.run()).rejects.toBe(error);
  expect(f.db.$transaction).toHaveBeenCalledOnce();
  expect(pause).not.toHaveBeenCalled();
});

it("retries a connection acquisition failure before the callback starts", async () => {
  const f = database(async () => "admitted");
  f.db.$transaction.mockRejectedValueOnce({ code: "P2024" });
  await expect(f.run()).resolves.toBe("admitted");
  expect(f.transaction).toHaveBeenCalledOnce();
  expect(f.db.$transaction).toHaveBeenCalledTimes(2);
});

it("does not replay a callback whose commit acknowledgement was lost", async () => {
  const f = database(async () => "admitted");
  const failure = { code: "ECONNRESET" };
  f.db.$transaction.mockImplementationOnce(async (callback) => {
    await callback({} as Prisma.TransactionClient);
    throw failure;
  });
  await expect(f.run()).rejects.toBe(failure);
  expect(f.transaction).toHaveBeenCalledOnce();
  expect(pause).not.toHaveBeenCalled();
});

it("records an accepted response under the taskset limit and replays only a confirmed rollback", async () => {
  const transaction = vi.fn(async () => "recorded");
  const db = {
    $transaction: vi.fn(async (callback: typeof transaction, _options?: unknown) => callback()),
  };
  transaction.mockRejectedValueOnce({
    code: "P2028",
    meta: { operation: "query", timeout: 30_000, timeTaken: 30_010 },
  });
  await expect(runAcceptedTasksetWrite(db as unknown as PrismaClient, transaction)).resolves.toBe(
    "recorded",
  );
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(db.$transaction).toHaveBeenLastCalledWith(
    expect.any(Function),
    TASKSET_TRANSACTION_OPTIONS,
  );
  const lost = { code: "ECONNRESET" };
  transaction.mockRejectedValueOnce(lost);
  await expect(runAcceptedTasksetWrite(db as unknown as PrismaClient, transaction)).rejects.toBe(
    lost,
  );
  expect(db.$transaction).toHaveBeenCalledTimes(3);
});
