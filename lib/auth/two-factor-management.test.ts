import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeEnrollmentAttempt: vi.fn(),
  consumeGrant: vi.fn(),
  decryptValue: vi.fn(),
  encryptBackupCodes: vi.fn(),
  encryptValue: vi.fn(),
  generateBackupCodes: vi.fn(),
  generateSecret: vi.fn(),
  totpVerify: vi.fn(),
  writeAudit: vi.fn(),
  transaction: {
    session: { deleteMany: vi.fn() },
    twoFactor: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { update: vi.fn(), updateMany: vi.fn() },
    verification: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  prisma: {
    verification: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (run: (client: typeof mocks.transaction) => unknown) => run(mocks.transaction),
    verification: mocks.prisma.verification,
  },
}));
vi.mock("./two-factor-step-up", () => ({
  consumeEnrollmentAttempt: mocks.consumeEnrollmentAttempt,
  consumeTwoFactorGrant: mocks.consumeGrant,
}));
vi.mock("./two-factor-material", () => ({
  decryptTwoFactorValue: mocks.decryptValue,
  encryptBackupCodes: mocks.encryptBackupCodes,
  encryptTwoFactorValue: mocks.encryptValue,
  generateTwoFactorBackupCodes: mocks.generateBackupCodes,
  generateTwoFactorSecret: mocks.generateSecret,
  twoFactorTotp: () => ({
    url: () => "otpauth://totp/bisibility:user?secret=NEWSECRET",
    verify: mocks.totpVerify,
  }),
}));

import {
  completeTwoFactorEnrollment,
  disableTwoFactor,
  regenerateTwoFactorBackupCodes,
} from "./two-factor-management";

const context = {
  actorId: "user_1",
  actorPublicId: "usr_abcdefghijklmnopqrstuvwx",
  credentialPasswordHash: null,
  email: "user@example.com",
  sessionCreatedAt: new Date(),
  sessionId: "session_1",
  twoFactorEnabled: true,
};

describe("transactional two-factor management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeGrant.mockResolvedValue(undefined);
    mocks.consumeEnrollmentAttempt.mockResolvedValue(undefined);
    mocks.encryptBackupCodes.mockResolvedValue("encrypted-backup-codes");
    mocks.encryptValue.mockResolvedValue("encrypted-secret");
    mocks.generateBackupCodes.mockReturnValue(["abcde-12345"]);
    mocks.totpVerify.mockResolvedValue(true);
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
    mocks.transaction.twoFactor.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.twoFactor.findFirst.mockResolvedValue({ id: "factor_1" });
    mocks.transaction.twoFactor.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.user.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.verification.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.verification.findFirst.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      id: "pending_1",
      identifier: "two-factor-enrollment:user_1:11111111-1111-4111-8111-111111111111",
      value: "encrypted-pending",
    });
    mocks.decryptValue.mockResolvedValue(JSON.stringify({ mode: "replace", secret: "new-secret" }));
  });

  it("keeps disable, audit and session revocation in one transaction", async () => {
    await expect(disableTwoFactor(context, "grant_1")).resolves.toEqual({ signedOut: true });

    expect(mocks.consumeGrant).toHaveBeenCalledWith(
      mocks.transaction,
      context,
      "disable",
      "grant_1",
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.two_factor_disabled",
        after: { enabled: false, sessionsRevoked: true },
      }),
      mocks.transaction,
    );
    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
    });
  });

  it("does not report disable success when its append-only audit cannot commit", async () => {
    mocks.writeAudit.mockRejectedValue(new Error("audit unavailable"));

    await expect(disableTwoFactor(context, "grant_1")).rejects.toThrow("audit unavailable");
    expect(mocks.transaction.session.deleteMany).not.toHaveBeenCalled();
  });

  it("audits backup-code replacement in the same transaction as the stored codes", async () => {
    await expect(regenerateTwoFactorBackupCodes(context, "grant_1")).resolves.toEqual({
      backupCodes: ["abcde-12345"],
    });

    expect(mocks.transaction.twoFactor.updateMany).toHaveBeenCalledWith({
      data: { backupCodes: "encrypted-backup-codes" },
      where: {
        OR: [{ verified: true }, { verified: null }],
        userId: "user_1",
      },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.two_factor_backup_codes_regenerated",
      }),
      mocks.transaction,
    );
  });

  it("does not mint backup codes until the new authenticator code succeeds", async () => {
    mocks.totpVerify.mockResolvedValue(false);

    await expect(
      completeTwoFactorEnrollment(context, {
        code: "000000",
        enrollmentId: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toMatchObject({ code: "step_up_failed" });

    expect(mocks.generateBackupCodes).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.two_factor_enrollment_verification_failed",
        status: "failed",
      }),
    );
  });

  it("commits replacement material, account state and audit after new-code verification", async () => {
    await expect(
      completeTwoFactorEnrollment(context, {
        code: "123456",
        enrollmentId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toEqual({ backupCodes: ["abcde-12345"], replaced: true });

    expect(mocks.transaction.twoFactor.update).toHaveBeenCalledWith({
      data: {
        backupCodes: "encrypted-backup-codes",
        failedVerificationCount: 0,
        lockedUntil: null,
        secret: "encrypted-secret",
        verified: true,
      },
      where: { id: "factor_1" },
    });
    expect(mocks.transaction.user.updateMany).toHaveBeenCalledWith({
      data: { twoFactorEnabled: true },
      where: { id: "user_1", twoFactorEnabled: true },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.two_factor_replaced" }),
      mocks.transaction,
    );
  });
});
