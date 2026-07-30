import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  decryptBackupCodes: vi.fn(),
  decryptValue: vi.fn(),
  encryptBackupCodes: vi.fn(),
  findBackupCode: vi.fn(),
  transaction: vi.fn(),
  transactionRolledBack: vi.fn(),
  totpVerify: vi.fn(),
  verifyPassword: vi.fn(),
  writeAudit: vi.fn(),
}));

const transaction = {
  twoFactor: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    updateManyAndReturn: vi.fn(),
  },
  verification: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
};

vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));
vi.mock("better-auth/crypto", () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock("./two-factor-material", () => ({
  decryptBackupCodes: mocks.decryptBackupCodes,
  decryptTwoFactorValue: mocks.decryptValue,
  encryptBackupCodes: mocks.encryptBackupCodes,
  findBackupCode: mocks.findBackupCode,
  twoFactorTotp: () => ({ verify: mocks.totpVerify }),
}));

import {
  authorizeTwoFactorOperation,
  consumeTwoFactorGrant,
  type TwoFactorSecurityContext,
} from "./two-factor-step-up";

const context: TwoFactorSecurityContext = {
  actorId: "user_1",
  actorPublicId: "usr_abcdefghijklmnopqrstuvwx",
  credentialPasswordHash: null,
  email: "user@example.com",
  sessionCreatedAt: new Date(),
  sessionId: "session_1",
  twoFactorEnabled: true,
};

const factor = {
  backupCodes: "encrypted-backup-codes",
  failedVerificationCount: 0,
  id: "factor_1",
  lockedUntil: null,
  secret: "encrypted-secret",
};

describe("two-factor management step-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consume.mockResolvedValue({
      limit: 5,
      remaining: 4,
      resetAt: Date.now() + 300_000,
      success: true,
    });
    mocks.decryptValue.mockResolvedValue("secret");
    mocks.totpVerify.mockResolvedValue(true);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
    mocks.transaction.mockImplementation(async (run: (client: typeof transaction) => unknown) => {
      try {
        return await run(transaction);
      } catch (error) {
        mocks.transactionRolledBack();
        throw error;
      }
    });
    transaction.twoFactor.findFirst.mockResolvedValue({ id: factor.id });
    transaction.twoFactor.findUnique.mockResolvedValue({ lockedUntil: null });
    transaction.twoFactor.update.mockResolvedValue({ failedVerificationCount: 1 });
    transaction.twoFactor.updateMany.mockResolvedValue({ count: 1 });
    transaction.twoFactor.updateManyAndReturn.mockResolvedValue([
      { ...factor, failedVerificationCount: 1 },
    ]);
    transaction.verification.create.mockResolvedValue({ id: "verification_1" });
    transaction.verification.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("rate-limits and verifies TOTP before issuing a session-scoped operation grant", async () => {
    const grantId = await authorizeTwoFactorOperation(context, "disable", {
      code: "123456",
      method: "totp",
      password: "",
    });

    expect(grantId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.consume).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, windowSeconds: 300 }),
    );
    expect(mocks.totpVerify).toHaveBeenCalledWith("123456");
    expect(transaction.verification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identifier: expect.stringMatching(/^two-factor-step-up:/),
        value: "user_1:session_1:disable",
      }),
    });
  });

  it("records and audits a failed current-factor attempt without issuing a grant", async () => {
    mocks.totpVerify.mockResolvedValue(false);

    await expect(
      authorizeTwoFactorOperation(context, "disable", {
        code: "000000",
        method: "totp",
        password: "",
      }),
    ).rejects.toMatchObject({ code: "step_up_failed" });

    expect(transaction.twoFactor.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          failedVerificationCount: { increment: 1 },
          lockedUntil: null,
        },
        where: expect.objectContaining({ id: "factor_1" }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.two_factor_step_up_failed",
        status: "failed",
      }),
      undefined,
    );
    expect(transaction.verification.create).not.toHaveBeenCalled();
  });

  it("audits an inconsistent enabled account that has no verified factor", async () => {
    transaction.twoFactor.findFirst.mockResolvedValue(null);

    await expect(
      authorizeTwoFactorOperation(context, "disable", {
        code: "123456",
        method: "totp",
        password: "",
      }),
    ).rejects.toMatchObject({ code: "step_up_failed" });

    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ statusReason: "Current factor is unavailable." }),
      undefined,
    );
    expect(mocks.totpVerify).not.toHaveBeenCalled();
  });

  it("locks the account-level factor budget after the fifth failed attempt", async () => {
    transaction.twoFactor.updateManyAndReturn.mockResolvedValue([
      { ...factor, failedVerificationCount: 5 },
    ]);
    mocks.totpVerify.mockResolvedValue(false);

    await expect(
      authorizeTwoFactorOperation(context, "disable", {
        code: "000000",
        method: "totp",
        password: "",
      }),
    ).rejects.toMatchObject({ code: "step_up_locked" });

    expect(transaction.twoFactor.update).toHaveBeenCalledWith({
      data: { lockedUntil: expect.any(Date) },
      where: { id: "factor_1" },
    });
  });

  it("atomically clears an expired lock while claiming the next factor attempt", async () => {
    transaction.twoFactor.updateManyAndReturn.mockResolvedValue([
      { ...factor, failedVerificationCount: 1 },
    ]);

    await authorizeTwoFactorOperation(context, "disable", {
      code: "123456",
      method: "totp",
      password: "",
    });

    expect(transaction.twoFactor.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          failedVerificationCount: { increment: 1 },
          lockedUntil: null,
        },
      }),
    );
    expect(transaction.twoFactor.updateMany).toHaveBeenCalledWith({
      data: { failedVerificationCount: 0, lockedUntil: null },
      where: { id: "factor_1", lockedUntil: { lte: expect.any(Date) } },
    });
  });

  it("normalizes a legacy null failure counter before incrementing it", async () => {
    await authorizeTwoFactorOperation(context, "disable", {
      code: "123456",
      method: "totp",
      password: "",
    });

    expect(transaction.twoFactor.updateMany).toHaveBeenCalledWith({
      data: { failedVerificationCount: 0 },
      where: { failedVerificationCount: null, id: "factor_1" },
    });
  });

  it("does not verify a factor when the database attempt budget is already locked", async () => {
    const lockedUntil = new Date(Date.now() + 60_000);
    transaction.twoFactor.updateManyAndReturn.mockResolvedValue([]);
    transaction.twoFactor.findUnique.mockResolvedValue({ lockedUntil });

    await expect(
      authorizeTwoFactorOperation(context, "disable", {
        code: "123456",
        method: "totp",
        password: "",
      }),
    ).rejects.toMatchObject({ code: "step_up_locked", retryAt: lockedUntil.getTime() });

    expect(mocks.totpVerify).not.toHaveBeenCalled();
  });

  it("keeps a valid backup code until replacement enrollment completes", async () => {
    mocks.decryptBackupCodes.mockResolvedValue(["abcde-12345", "vwxyz-67890"]);
    mocks.findBackupCode.mockReturnValue(0);

    await authorizeTwoFactorOperation(context, "replace", {
      code: "abcde-12345",
      method: "backup_code",
      password: "",
    });

    expect(transaction.twoFactor.updateMany).toHaveBeenCalledWith({
      data: {
        failedVerificationCount: 0,
        lockedUntil: null,
      },
      where: {
        id: "factor_1",
      },
    });
    expect(mocks.encryptBackupCodes).not.toHaveBeenCalled();
  });

  it("rolls back a claimed attempt when a valid backup-code consumption loses a race", async () => {
    mocks.decryptBackupCodes.mockResolvedValue(["abcde-12345", "vwxyz-67890"]);
    mocks.findBackupCode.mockReturnValue(0);
    mocks.encryptBackupCodes.mockResolvedValue("encrypted-remaining-code");
    transaction.twoFactor.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      authorizeTwoFactorOperation(context, "disable", {
        code: "abcde-12345",
        method: "backup_code",
        password: "",
      }),
    ).rejects.toMatchObject({ code: "unavailable" });

    expect(mocks.transactionRolledBack).toHaveBeenCalledOnce();
    expect(transaction.verification.create).not.toHaveBeenCalled();
  });

  it("commits the database attempt budget when rejection auditing fails", async () => {
    mocks.totpVerify.mockResolvedValue(false);
    mocks.writeAudit.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      authorizeTwoFactorOperation(context, "disable", {
        code: "000000",
        method: "totp",
        password: "",
      }),
    ).rejects.toMatchObject({ code: "step_up_failed" });

    expect(transaction.twoFactor.updateManyAndReturn).toHaveBeenCalledOnce();
    expect(mocks.transactionRolledBack).not.toHaveBeenCalled();
  });

  it("fails closed when the management rate limiter rejects the attempt", async () => {
    mocks.consume.mockResolvedValue({
      limit: 5,
      remaining: 0,
      resetAt: Date.now() + 300_000,
      success: false,
    });

    await expect(
      authorizeTwoFactorOperation(context, "disable", {
        code: "123456",
        method: "totp",
        password: "",
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(transaction.twoFactor.findFirst).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ statusReason: "Rate limit exceeded." }),
      undefined,
    );
  });

  it("verifies a credential password server-side before checking the current factor", async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(
      authorizeTwoFactorOperation(
        { ...context, credentialPasswordHash: "stored-password-hash" },
        "disable",
        { code: "123456", method: "totp", password: "wrong-password" },
      ),
    ).rejects.toMatchObject({ code: "step_up_failed" });

    expect(mocks.verifyPassword).toHaveBeenCalledWith({
      hash: "stored-password-hash",
      password: "wrong-password",
    });
    expect(transaction.twoFactor.findFirst).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ statusReason: "Credential verification failed." }),
      undefined,
    );
  });

  it("requires an authoritative fresh session for first enrollment", async () => {
    const staleContext = {
      ...context,
      sessionCreatedAt: new Date(Date.now() - 301_000),
      twoFactorEnabled: false,
    };

    await expect(
      authorizeTwoFactorOperation(staleContext, "enroll", {
        code: "",
        method: "totp",
        password: "",
      }),
    ).rejects.toMatchObject({ code: "session_not_fresh" });
    expect(transaction.verification.create).not.toHaveBeenCalled();
  });

  it("consumes a grant only when user, session, operation and expiry match", async () => {
    await consumeTwoFactorGrant(transaction as never, context, "regenerate", "grant_1");

    expect(transaction.verification.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { gt: expect.any(Date) },
        identifier: "two-factor-step-up:grant_1",
        value: "user_1:session_1:regenerate",
      },
    });
  });
});
