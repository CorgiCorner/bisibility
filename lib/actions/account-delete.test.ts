import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  delete: vi.fn(),
  findUnique: vi.fn(),
  executeRaw: vi.fn(),
  redirect: vi.fn(),
  requireSession: vi.fn(),
  transaction: vi.fn(),
  tx: {
    $executeRaw: vi.fn(),
    auditLog: { create: vi.fn() },
    user: {
      count: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/account/profile-service", () => ({ updateProfileNameRecord: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { deleteAccount } from "./account";

const counts = { accounts: 0, memberships: 0, projects: 0, sessions: 1 };

function user(id: string, isInstanceAdmin: boolean) {
  return {
    _count: counts,
    email: `${id}@example.test`,
    id,
    isInstanceAdmin,
    name: id,
    publicId: id === "admin_2" ? "usr_b00000000000000000000000" : "usr_a00000000000000000000000",
  };
}

describe("deleteAccount instance-admin guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.$executeRaw.mockImplementation(mocks.executeRaw);
    mocks.tx.user.count.mockImplementation(mocks.count);
    mocks.tx.user.delete.mockImplementation(mocks.delete);
    mocks.tx.user.findUnique.mockImplementation(mocks.findUnique);
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.executeRaw.mockResolvedValue(1);
    mocks.delete.mockResolvedValue({ id: "user_1" });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
    mocks.requireSession.mockResolvedValue({
      session: { id: "session_1" },
      user: { email: "user_1@example.test", id: "user_1" },
    });
  });

  it("blocks deletion of the sole instance admin and commits the refusal audit", async () => {
    mocks.findUnique.mockResolvedValue(user("user_1", true));
    mocks.count.mockResolvedValue(1);

    await expect(deleteAccount({ email: "user_1@example.test" })).rejects.toMatchObject({
      code: "last_instance_admin",
      message:
        "Transfer instance administration first - seed another admin, then delete this account.",
    });

    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      {
        action: "instance_admin.delete_blocked",
        actorId: "user_1",
        before: { isInstanceAdmin: true },
        status: "failed",
        statusReason:
          "Transfer instance administration first - seed another admin, then delete this account.",
        targetId: "usr_a00000000000000000000000",
        targetType: "user",
      },
      mocks.tx,
    );
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("allows an admin to delete their account when another admin remains", async () => {
    mocks.findUnique.mockResolvedValue(user("user_1", true));
    mocks.count.mockResolvedValue(2);

    await deleteAccount({ email: "user_1@example.test" });

    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "user_1" } });
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("does not apply the admin count guard to a non-admin account", async () => {
    mocks.findUnique.mockResolvedValue(user("user_1", false));

    await deleteAccount({ email: "user_1@example.test" });

    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "user_1" } });
  });

  it("leaves one admin when the final two admins delete concurrently", async () => {
    const users = new Map([
      ["admin_1", user("admin_1", true)],
      ["admin_2", user("admin_2", true)],
    ]);
    let transactionTail = Promise.resolve();
    mocks.requireSession
      .mockResolvedValueOnce({
        session: { id: "session_1" },
        user: { email: "admin_1@example.test", id: "admin_1" },
      })
      .mockResolvedValueOnce({
        session: { id: "session_2" },
        user: { email: "admin_2@example.test", id: "admin_2" },
      });
    mocks.transaction.mockImplementation((callback) => {
      const run = transactionTail.then(() => callback(mocks.tx));
      transactionTail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    });
    mocks.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(users.get(where.id) ?? null),
    );
    mocks.count.mockImplementation(() =>
      Promise.resolve([...users.values()].filter((entry) => entry.isInstanceAdmin).length),
    );
    mocks.delete.mockImplementation(({ where }: { where: { id: string } }) => {
      users.delete(where.id);
      return Promise.resolve({ id: where.id });
    });

    const results = await Promise.allSettled([
      deleteAccount({ email: "admin_1@example.test" }),
      deleteAccount({ email: "admin_2@example.test" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect([...users.values()].filter((entry) => entry.isInstanceAdmin)).toHaveLength(1);
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "instance_admin.delete_blocked" }),
      mocks.tx,
    );
  });
});
