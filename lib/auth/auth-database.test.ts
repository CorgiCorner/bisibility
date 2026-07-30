import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prismaTransaction: vi.fn(),
  transaction: { account: { count: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.prismaTransaction,
    account: { count: vi.fn() },
  },
}));

import { authDatabase, currentAuthTransaction } from "./auth-database";

describe("Better Auth transaction context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prismaTransaction.mockImplementation(async (callback) => callback(mocks.transaction));
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
});
