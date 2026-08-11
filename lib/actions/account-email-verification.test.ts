import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  headers: vi.fn(),
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  sendVerificationOTP: vi.fn(),
  verifyEmailOTP: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      sendVerificationOTP: mocks.sendVerificationOTP,
      verifyEmailOTP: mocks.verifyEmailOTP,
    },
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import {
  confirmCurrentAccountEmailVerification,
  requestCurrentAccountEmailVerification,
} from "@/lib/actions/account-email";

const publicId = "usr_abcdefghijklmnopqrstuvwx";
const session = { user: { id: "user_1" } };
const unverifiedUser = {
  email: "owner@example.com",
  emailVerified: false,
  publicId,
};

describe("current account email verification actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSession.mockResolvedValue(session);
    mocks.findUnique.mockResolvedValue(unverifiedUser);
    mocks.headers.mockResolvedValue(new Headers({ cookie: "session=test" }));
    mocks.sendVerificationOTP.mockResolvedValue({ success: true });
    mocks.verifyEmailOTP.mockResolvedValue({
      status: true,
      token: null,
      user: { id: "user_1" },
    });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it.each([
    ["request", () => requestCurrentAccountEmailVerification({ email: "owner@example.com" })],
    [
      "confirmation",
      () => confirmCurrentAccountEmailVerification({ code: "123456", email: "owner@example.com" }),
    ],
  ])("requires authentication before %s", async (_operation, run) => {
    const unauthorized = new Error("unauthorized");
    mocks.requireSession.mockRejectedValueOnce(unauthorized);

    await expect(run()).rejects.toBe(unauthorized);

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
    expect(mocks.verifyEmailOTP).not.toHaveBeenCalled();
  });

  it.each([
    ["request", () => requestCurrentAccountEmailVerification({ email: "invalid" })],
    [
      "confirmation",
      () =>
        confirmCurrentAccountEmailVerification({
          code: "not-a-code",
          email: "owner@example.com",
        }),
    ],
  ])("rejects invalid %s input before reading the account", async (_operation, run) => {
    await expect(run()).rejects.toThrow();

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
    expect(mocks.verifyEmailOTP).not.toHaveBeenCalled();
  });

  it("binds verification requests to the persisted current email", async () => {
    await expect(
      requestCurrentAccountEmailVerification({ email: "other@example.org" }),
    ).rejects.toThrow("Email does not match the current account.");

    expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("does not request another code for an already verified account", async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...unverifiedUser, emailVerified: true });

    await expect(
      requestCurrentAccountEmailVerification({ email: "owner@example.com" }),
    ).rejects.toThrow("Email is already verified.");

    expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
  });

  it("requests an email-verification OTP and audits without a code", async () => {
    const result = await requestCurrentAccountEmailVerification({
      email: " OWNER@EXAMPLE.COM ",
    });

    expect(mocks.sendVerificationOTP).toHaveBeenCalledWith({
      body: { email: "owner@example.com", type: "email-verification" },
      headers: expect.any(Headers),
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "account.email_verification_requested",
      actorId: "user_1",
      after: { email: "owner@example.com" },
      targetId: publicId,
      targetType: "user",
    });
    expect(result).toEqual({ email: "owner@example.com", status: "verification_required" });
  });

  it("does not audit a verification request rejected by Better Auth", async () => {
    mocks.sendVerificationOTP.mockRejectedValueOnce(new Error("mailer unavailable"));

    await expect(
      requestCurrentAccountEmailVerification({ email: "owner@example.com" }),
    ).rejects.toThrow("Verification code could not be sent.");

    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("confirms the current user, verifies persisted state, audits, and revalidates", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(unverifiedUser)
      .mockResolvedValueOnce({ ...unverifiedUser, emailVerified: true });

    const result = await confirmCurrentAccountEmailVerification({
      code: "123456",
      email: "owner@example.com",
    });

    expect(mocks.verifyEmailOTP).toHaveBeenCalledWith({
      body: { email: "owner@example.com", otp: "123456" },
      headers: expect.any(Headers),
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "account.email_verified",
      actorId: "user_1",
      after: { email: "owner@example.com", emailVerified: true },
      before: { email: "owner@example.com", emailVerified: false },
      targetId: publicId,
      targetType: "user",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app", "layout");
    expect(result).toEqual({
      email: "owner@example.com",
      emailVerification: "verified",
      status: "verified",
    });
  });

  it("does not audit success when the code is invalid", async () => {
    mocks.verifyEmailOTP.mockRejectedValueOnce(new Error("invalid otp"));

    await expect(
      confirmCurrentAccountEmailVerification({
        code: "123456",
        email: "owner@example.com",
      }),
    ).rejects.toThrow("The verification code is invalid or expired.");

    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a Better Auth response for a different user", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(unverifiedUser)
      .mockResolvedValueOnce({ ...unverifiedUser, emailVerified: true });
    mocks.verifyEmailOTP.mockResolvedValueOnce({
      status: true,
      token: null,
      user: { id: "user_2" },
    });

    await expect(
      confirmCurrentAccountEmailVerification({
        code: "123456",
        email: "owner@example.com",
      }),
    ).rejects.toThrow("Email verification could not be confirmed.");

    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("does not audit success when persisted verification did not change", async () => {
    await expect(
      confirmCurrentAccountEmailVerification({
        code: "123456",
        email: "owner@example.com",
      }),
    ).rejects.toThrow("Email verification could not be confirmed.");

    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("never includes the verification code in audit input", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(unverifiedUser)
      .mockResolvedValueOnce({ ...unverifiedUser, emailVerified: true });

    await confirmCurrentAccountEmailVerification({
      code: "123456",
      email: "owner@example.com",
    });

    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("123456");
  });
});
