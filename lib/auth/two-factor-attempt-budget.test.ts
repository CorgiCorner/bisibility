import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimFactorAttempt, recordInvalidFactor } from "./two-factor-attempt-budget";

const transaction = {
  twoFactor: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    updateManyAndReturn: vi.fn(),
  },
};

const factor = {
  backupCodes: "encrypted-backup-codes",
  failedVerificationCount: 1,
  id: "factor_1",
  secret: "encrypted-secret",
};

describe("two-factor database attempt budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.twoFactor.findFirst.mockResolvedValue({ id: factor.id });
    transaction.twoFactor.findUnique.mockResolvedValue({ lockedUntil: null });
    transaction.twoFactor.update.mockResolvedValue({});
    transaction.twoFactor.updateMany.mockResolvedValue({ count: 1 });
    transaction.twoFactor.updateManyAndReturn.mockResolvedValue([factor]);
  });

  it("returns an auditable reason without performing audit I/O in the transaction", async () => {
    transaction.twoFactor.findFirst.mockResolvedValue(null);

    await expect(claimFactorAttempt(transaction as never, "user_1")).resolves.toEqual({
      auditReason: "Current factor is unavailable.",
      status: "invalid",
    });
  });

  it("normalizes legacy state before atomically claiming an attempt", async () => {
    await expect(claimFactorAttempt(transaction as never, "user_1")).resolves.toEqual({
      factor,
      status: "claimed",
    });
    expect(transaction.twoFactor.updateMany).toHaveBeenNthCalledWith(1, {
      data: { failedVerificationCount: 0 },
      where: { failedVerificationCount: null, id: "factor_1" },
    });
    expect(transaction.twoFactor.updateMany).toHaveBeenNthCalledWith(2, {
      data: { failedVerificationCount: 0, lockedUntil: null },
      where: { id: "factor_1", lockedUntil: { lte: expect.any(Date) } },
    });
  });

  it("returns an active database lock without claiming another attempt", async () => {
    const lockedUntil = new Date(Date.now() + 60_000);
    transaction.twoFactor.updateManyAndReturn.mockResolvedValue([]);
    transaction.twoFactor.findUnique.mockResolvedValue({ lockedUntil });

    await expect(claimFactorAttempt(transaction as never, "user_1")).resolves.toEqual({
      auditReason: "Current factor is locked.",
      retryAt: lockedUntil.getTime(),
      status: "locked",
    });
    expect(transaction.twoFactor.update).not.toHaveBeenCalled();
  });

  it("persists the fifth-attempt lock without depending on audit availability", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
    try {
      const lockedUntil = await recordInvalidFactor(transaction as never, {
        failedVerificationCount: 5,
        id: "factor_1",
      });

      expect(lockedUntil).toEqual(new Date("2026-07-27T12:15:00.000Z"));
      expect(transaction.twoFactor.update).toHaveBeenCalledWith({
        data: { lockedUntil },
        where: { id: "factor_1" },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
