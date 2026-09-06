import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prismaTransaction: vi.fn(),
  transaction: { account: { count: vi.fn() }, user: { create: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.prismaTransaction,
    account: { count: vi.fn() },
  },
}));

import { authDatabase, currentAuthTransaction } from "./auth-database";
import { sendCloudWelcomeSequence } from "./welcome-signup";

describe("Better Auth transaction context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prismaTransaction.mockImplementation(async (callback) => callback(mocks.transaction));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes the active transaction to auth database hooks", async () => {
    const authOperation = vi.fn().mockImplementation(async (transaction) => {
      expect(transaction).toBe(mocks.transaction);
      expect(currentAuthTransaction()).toBe(mocks.transaction);
      return { id: "account_1" };
    });

    await authDatabase.$transaction(authOperation);

    expect(mocks.prismaTransaction).toHaveBeenCalledWith(expect.any(Function));
    expect(authOperation).toHaveBeenCalledWith(mocks.transaction);
    expect(currentAuthTransaction()).toBeNull();
  });

  it("leaves no welcome intent when the user-creating transaction rolls back", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    const committed: Array<Record<string, unknown>> = [];
    let staged: Record<string, unknown> | null = null;
    mocks.transaction.user.create.mockImplementation(async ({ data }) => {
      staged = data;
      return data;
    });
    mocks.prismaTransaction.mockImplementation(async (callback) => {
      const result = await callback(mocks.transaction);
      if (staged) committed.push(staged);
      return result;
    });

    await expect(
      authDatabase.$transaction(async (transaction) => {
        const prepared = await sendCloudWelcomeSequence({
          email: "rolled-back@example.test",
          id: "user_rollback",
          name: "Rollback",
        });
        await transaction.user.create({ data: prepared?.data as never });
        throw new Error("roll back signup");
      }),
    ).rejects.toThrow("roll back signup");

    expect(staged).toMatchObject({ welcomeFollowupRequestedAt: expect.any(Date) });
    expect(committed).toEqual([]);
  });
});
