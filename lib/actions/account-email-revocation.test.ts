import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeEmail: vi.fn(),
  countSessions: vi.fn(),
  deleteManySessions: vi.fn(),
  findUnique: vi.fn(),
  headers: vi.fn(),
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  sendEmailChangedNotice: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { changeEmailEmailOTP: mocks.changeEmail } },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    session: { count: mocks.countSessions, deleteMany: mocks.deleteManySessions },
    user: { findUnique: mocks.findUnique },
  },
}));
vi.mock("@/lib/email/email-changed-notice", () => ({
  sendEmailChangedNotice: mocks.sendEmailChangedNotice,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { confirmAccountEmailChange } from "@/lib/actions/account-email";

const publicId = "usr_abcdefghijklmnopqrstuvwx";
const session = { session: { id: "sess_1" }, user: { id: "user_1" } };
const currentUser = { email: "owner@example.com", emailVerified: true, publicId };
const changedUser = { email: "next@example.com", emailVerified: true, publicId };
const input = { code: "123456", newEmail: "next@example.com" };

/**
 * Other sessions are revoked by the Better Auth `user.update.before` hook, which runs after the
 * code is verified and consumed. The action must never revoke ahead of that verification, and
 * must still audit and sweep afterwards. These cases pin that contract.
 */
describe("confirmAccountEmailChange session revocation contract", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    // A case that stops before the second lookup leaves a queued once-value behind.
    mocks.findUnique.mockReset();
    mocks.requireSession.mockResolvedValue(session);
    mocks.findUnique.mockResolvedValueOnce(currentUser).mockResolvedValueOnce(changedUser);
    mocks.headers.mockResolvedValue(new Headers({ cookie: "session=test" }));
    mocks.changeEmail.mockResolvedValue({ success: true });
    mocks.countSessions.mockResolvedValue(2);
    mocks.deleteManySessions.mockResolvedValue({ count: 0 });
    mocks.sendEmailChangedNotice.mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleError.mockClear();
  });

  it("never revokes sessions before Better Auth has verified the code", async () => {
    mocks.changeEmail.mockRejectedValueOnce(new Error("Invalid OTP"));

    await expect(confirmAccountEmailChange(input)).rejects.toThrow(
      "The verification code is invalid or expired, or the email is unavailable.",
    );

    expect(mocks.deleteManySessions).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("audits the number of other sessions the change revoked", async () => {
    await confirmAccountEmailChange(input);

    const countedAt = mocks.countSessions.mock.invocationCallOrder[0];
    const changedAt = mocks.changeEmail.mock.invocationCallOrder[0];
    expect(countedAt).toBeLessThan(changedAt);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.email_changed",
        after: { email: "next@example.com", revokedSessionCount: 2 },
      }),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("sweeps and reports sessions that survived the hook", async () => {
    mocks.deleteManySessions.mockResolvedValueOnce({ count: 1 });

    await confirmAccountEmailChange(input);

    expect(mocks.deleteManySessions).toHaveBeenCalledExactlyOnceWith({
      where: { id: { not: "sess_1" }, userId: "user_1" },
    });
    expect(consoleError).toHaveBeenCalledWith("[account] sessions survived the email change hook", {
      survivors: 1,
    });
    expect(mocks.writeAudit).toHaveBeenCalledOnce();
  });

  it("revalidates before the audit write so a late failure cannot leave stale views", async () => {
    mocks.writeAudit.mockRejectedValueOnce(new Error("audit store unavailable"));

    await expect(confirmAccountEmailChange(input)).rejects.toThrow("audit store unavailable");

    expect(mocks.changeEmail).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });
});
