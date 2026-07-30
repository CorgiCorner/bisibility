import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prismaTransaction: vi.fn(),
  queryRaw: vi.fn(),
  transaction: {
    $queryRaw: vi.fn(),
    auditLog: { create: vi.fn() },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: mocks.prismaTransaction },
}));

import { promoteFirstRunAdministrator } from "./first-run-account";

const requestContext = {
  appVersion: "test",
  correlationId: "request_1",
  sourceIpHash: null,
  sourceIpMasked: null,
  userAgent: null,
};

describe("first-run administrator promotion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.$queryRaw.mockImplementation(mocks.queryRaw);
    mocks.prismaTransaction.mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.transaction.user.findFirst.mockResolvedValue({ id: "existing_admin" });
    mocks.transaction.user.findUnique.mockResolvedValue({ isInstanceAdmin: false });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it("promotes and audits the signed-in user in a serializable transaction", async () => {
    mocks.queryRaw.mockResolvedValue([{ publicId: "usr_abcdefghijklmnopqrstuvwx" }]);

    await expect(
      promoteFirstRunAdministrator("user_admin", "admin@example.com", requestContext),
    ).resolves.toBe("promoted");

    expect(mocks.prismaTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      {
        action: "instance_admin.first_run_completed",
        actorId: "user_admin",
        after: { email: "admin@example.com", isInstanceAdmin: true },
        before: { isInstanceAdmin: false },
        requestContext,
        targetId: "usr_abcdefghijklmnopqrstuvwx",
        targetType: "user",
      },
      mocks.transaction,
    );

    const [strings, userId] = mocks.queryRaw.mock.calls[0] as [TemplateStringsArray, string];
    const sql = strings.join("?").replace(/\s+/g, " ");
    expect(userId).toBe("user_admin");
    expect(sql).toContain('candidate."isInstanceAdmin" = false');
    expect(sql).toContain("AND NOT EXISTS");
    expect(sql).toContain('existing."isInstanceAdmin" = true');
    expect(sql).toContain('RETURNING candidate."publicId"');
  });

  it("allows exactly one administrator when signed-in submissions race", async () => {
    let administratorCreated = false;
    mocks.queryRaw.mockImplementation(async (_strings: TemplateStringsArray, _userId: string) => {
      if (administratorCreated) {
        return [];
      }
      administratorCreated = true;
      return [{ publicId: "usr_abcdefghijklmnopqrstuvwx" }];
    });

    const results = await Promise.all([
      promoteFirstRunAdministrator("user_first", "first@example.com", requestContext),
      promoteFirstRunAdministrator("user_second", "second@example.com", requestContext),
    ]);

    expect(results.sort()).toEqual(["administrator_exists", "promoted"]);
    expect(mocks.writeAudit).toHaveBeenCalledOnce();
  });

  it("lets an already-promoted caller finish idempotently", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    mocks.transaction.user.findUnique.mockResolvedValue({ isInstanceAdmin: true });

    await expect(
      promoteFirstRunAdministrator("user_admin", "admin@example.com", requestContext),
    ).resolves.toBe("already_administrator");

    expect(mocks.transaction.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("returns retry when no administrator exists and the candidate was not promoted", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    mocks.transaction.user.findFirst.mockResolvedValue(null);

    await expect(
      promoteFirstRunAdministrator("user_admin", "admin@example.com", requestContext),
    ).resolves.toBe("retry");

    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("retries serialization conflicts and rechecks the zero-admin condition", async () => {
    const conflict = Object.assign(new Error("transaction conflict"), { code: "P2034" });
    mocks.prismaTransaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback) => callback(mocks.transaction));
    mocks.queryRaw.mockResolvedValue([{ publicId: "usr_abcdefghijklmnopqrstuvwx" }]);

    await expect(
      promoteFirstRunAdministrator("user_admin", "admin@example.com", requestContext),
    ).resolves.toBe("promoted");
    expect(mocks.prismaTransaction).toHaveBeenCalledTimes(2);
  });
});
