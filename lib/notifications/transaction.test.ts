import type { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";
import { notificationTransaction, queueNotificationEvent } from "./transaction";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  publish: vi.fn(async () => ({ mode: "polling", ok: true })),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("./realtime", () => ({ publishNotificationCreated: mocks.publish }));
const event = {
  id: "n",
  userId: "u",
  projectId: "p",
  createdAt: "2026-01-01T00:00:00Z",
  kind: "updated" as const,
};
const tx = {} as Prisma.TransactionClient;
beforeEach(() => vi.clearAllMocks());
it("IN-6 publishes only after the owning transaction resolves, including commit latency", async () => {
  let commit: (() => void) | undefined;
  mocks.transaction.mockImplementation(async (persist) => {
    const result = await persist(tx);
    await new Promise<void>((resolve) => {
      commit = resolve;
    });
    return result;
  });
  const result = notificationTransaction(async (client) => {
    queueNotificationEvent(client, event);
    return 7;
  });
  await vi.waitFor(() => expect(commit).toBeTypeOf("function"));
  expect(mocks.publish).not.toHaveBeenCalled();
  commit?.();
  await expect(result).resolves.toBe(7);
  expect(mocks.publish).toHaveBeenCalledExactlyOnceWith(event);
});
it("IN-6 rollback after notification persistence publishes nothing", async () => {
  mocks.transaction.mockImplementation(async (persist) => {
    await persist(tx);
    throw new Error("commit rejected");
  });
  await expect(
    notificationTransaction(async (client) => {
      queueNotificationEvent(client, event);
    }),
  ).rejects.toThrow("commit rejected");
  expect(mocks.publish).not.toHaveBeenCalled();
});
it("summary tasks wait for commit, tolerate failure and disappear on rollback", async () => {
  const { queueNotificationAfterCommit } = await import("./transaction");
  const task = vi.fn(async () => {
    throw new Error("best effort fixture");
  });
  mocks.transaction.mockImplementation(async (persist) => {
    const result = await persist(tx);
    expect(task).not.toHaveBeenCalled();
    return result;
  });
  await expect(
    notificationTransaction(async (client) => {
      queueNotificationAfterCommit(client, task);
      return 8;
    }),
  ).resolves.toBe(8);
  expect(task).toHaveBeenCalledOnce();
  task.mockClear();
  mocks.transaction.mockImplementation(async (persist) => {
    await persist(tx);
    throw new Error("commit rejected");
  });
  await expect(
    notificationTransaction(async (client) => {
      queueNotificationAfterCommit(client, task);
    }),
  ).rejects.toThrow("commit rejected");
  expect(task).not.toHaveBeenCalled();
});

it("does not run or retain callbacks for an unowned transaction client", async () => {
  const { queueNotificationAfterCommit } = await import("./transaction");
  const task = vi.fn(async () => undefined);
  expect(() => queueNotificationAfterCommit(tx, task)).not.toThrow();
  expect(task).not.toHaveBeenCalled();
});
