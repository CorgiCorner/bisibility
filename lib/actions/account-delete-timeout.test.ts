import { redirect } from "@/tests/next-navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appleAccounts: vi.fn(),
  currentUser: vi.fn(),
  transaction: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/analytics/deletion-provider", () => ({
  shouldQueueAnalyticsPersonDeletion: () => true,
  deleteServerPersons: vi.fn().mockResolvedValue(false),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/account/profile-service", () => ({ updateProfileNameRecord: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/demo/mutable-account-session", () => ({
  requireMutableAccountSession: async () => ({
    session: { id: "session_1" },
    user: { email: "account@example.com", id: "user_1" },
  }),
}));
vi.mock("@/lib/demo/identity", () => ({
  assertEditableDemoIdentityPreserved: vi.fn().mockResolvedValue(undefined),
}));
// Deletion confirms the email and revokes Apple sign-in tokens before its transaction.
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    account: { findMany: mocks.appleAccounts },
    user: { findUnique: mocks.currentUser },
  },
}));

import { deleteAccount } from "./account";

type TransactionOptions = { isolationLevel: string; timeout?: number };

function deletionDatabase(elapsedMs: number) {
  const stored = { auditActions: [] as string[], deleted: false, deletionIds: [] as string[] };
  const pending = { auditActions: [] as string[], deleted: false, deletionIds: [] as string[] };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    billingAppStoreAccount: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    analyticsPersonDeletion: {
      createMany: vi.fn(async ({ data }: { data: { distinctId: string }[] }) => {
        pending.deletionIds.push(...data.map((row) => row.distinctId));
        return { count: data.length };
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        _count: { accounts: 0, memberships: 0, projects: 1, sessions: 1 },
        email: "account@example.com",
        isInstanceAdmin: false,
        name: "Account",
        publicId: "usr_a00000000000000000000000",
      }),
      delete: vi.fn(async () => {
        vi.setSystemTime(Date.now() + elapsedMs);
        pending.deleted = true;
        return { id: "user_1" };
      }),
    },
  };
  mocks.writeAudit.mockImplementation(async (input, client) => {
    expect(client).toBe(tx);
    pending.auditActions.push(input.action);
  });
  mocks.transaction.mockImplementation(
    async (callback: (client: typeof tx) => Promise<unknown>, options: TransactionOptions) => {
      const started = Date.now();
      const result = await callback(tx);
      // Match Prisma's commit-time deadline check and commit all writes together.
      if (Date.now() - started > (options.timeout ?? 5_000)) {
        throw Object.assign(new Error("Cannot commit an expired transaction."), { code: "P2028" });
      }
      stored.auditActions = [...pending.auditActions];
      stored.deleted = pending.deleted;
      stored.deletionIds = [...pending.deletionIds];
      return result;
    },
  );
  return { stored, tx };
}

describe("deleteAccount transaction deadline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appleAccounts.mockResolvedValue([]);
    mocks.currentUser.mockResolvedValue({
      email: "account@example.com",
      publicId: "usr_a00000000000000000000000",
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T22:28:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("commits deletion and its audit after a 12,197 ms cascade", async () => {
    const { stored, tx } = deletionDatabase(12_197);

    await deleteAccount({ email: "account@example.com" });

    expect(stored).toEqual({
      auditActions: ["account.deleted"],
      deleted: true,
      deletionIds: ["user_1", "usr_a00000000000000000000000"],
    });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.billingAppStoreAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_1" } }),
    );
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      timeout: 30_000,
    });
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("does not commit or retry a deletion that exceeds the bounded deadline", async () => {
    const { stored, tx } = deletionDatabase(30_001);

    await expect(deleteAccount({ email: "account@example.com" })).rejects.toMatchObject({
      code: "P2028",
    });

    expect(tx.user.delete).toHaveBeenCalledOnce();
    expect(tx.analyticsPersonDeletion.createMany).toHaveBeenCalledOnce();
    expect(stored).toEqual({ auditActions: [], deleted: false, deletionIds: [] });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("retries a serialization conflict within the existing three-attempt bound", async () => {
    const { stored } = deletionDatabase(12_197);
    mocks.transaction.mockRejectedValueOnce(
      Object.assign(new Error("Write conflict"), { code: "P2034" }),
    );

    await deleteAccount({ email: "account@example.com" });

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(stored).toEqual({
      auditActions: ["account.deleted"],
      deleted: true,
      deletionIds: ["user_1", "usr_a00000000000000000000000"],
    });
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("stops after three serialization conflicts without committing any writes", async () => {
    const { stored } = deletionDatabase(12_197);
    const conflict = Object.assign(new Error("Write conflict"), { code: "P2034" });
    mocks.transaction.mockRejectedValue(conflict);

    await expect(deleteAccount({ email: "account@example.com" })).rejects.toBe(conflict);

    expect(mocks.transaction).toHaveBeenCalledTimes(3);
    expect(stored).toEqual({ auditActions: [], deleted: false, deletionIds: [] });
    expect(redirect).not.toHaveBeenCalled();
  });
});
