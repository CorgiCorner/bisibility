import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeEmail: vi.fn(),
  findUnique: vi.fn(),
  headers: vi.fn(),
  requestEmailChange: vi.fn(),
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      changeEmailEmailOTP: mocks.changeEmail,
      requestEmailChangeEmailOTP: mocks.requestEmailChange,
    },
  },
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { confirmAccountEmailChange, requestAccountEmailChange } from "@/lib/actions/account-email";

const publicId = "usr_abcdefghijklmnopqrstuvwx";
const session = { user: { id: "user_1" } };
const currentUser = {
  email: "owner@example.com",
  emailVerified: true,
  publicId,
};

describe("account email change actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue(session);
    mocks.findUnique.mockResolvedValue(currentUser);
    mocks.headers.mockResolvedValue(new Headers({ cookie: "session=test" }));
    mocks.requestEmailChange.mockResolvedValue({ success: true });
    mocks.changeEmail.mockResolvedValue({ success: true });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it.each([
    ["request", () => requestAccountEmailChange({ newEmail: "next@example.com" })],
    [
      "confirmation",
      () => confirmAccountEmailChange({ code: "123456", newEmail: "next@example.com" }),
    ],
  ])("requires authentication before %s", async (_operation, run) => {
    const unauthorized = new Error("unauthorized");
    mocks.requireSession.mockRejectedValueOnce(unauthorized);

    await expect(run()).rejects.toBe(unauthorized);

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.requestEmailChange).not.toHaveBeenCalled();
    expect(mocks.changeEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["request", () => requestAccountEmailChange({ newEmail: "invalid" })],
    [
      "confirmation",
      () => confirmAccountEmailChange({ code: "not-a-code", newEmail: "next@example.com" }),
    ],
  ])("rejects invalid %s input before reading the account", async (_operation, run) => {
    await expect(run()).rejects.toThrow();

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.requestEmailChange).not.toHaveBeenCalled();
    expect(mocks.changeEmail).not.toHaveBeenCalled();
  });

  it("rejects the current email before requesting a code", async () => {
    await expect(requestAccountEmailChange({ newEmail: " OWNER@EXAMPLE.COM " })).rejects.toThrow(
      "Enter a different email address.",
    );

    expect(mocks.requestEmailChange).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("requests the Better Auth change code without changing the current email", async () => {
    const result = await requestAccountEmailChange({ newEmail: " NEXT@example.com " });

    expect(mocks.requestEmailChange).toHaveBeenCalledWith({
      body: { newEmail: "next@example.com" },
      headers: expect.any(Headers),
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "account.email_change_requested",
      actorId: "user_1",
      after: { email: "next@example.com" },
      before: { email: "owner@example.com" },
      targetId: publicId,
      targetType: "user",
    });
    expect(result).toEqual({
      currentEmail: "owner@example.com",
      pendingEmail: "next@example.com",
      status: "verification_required",
    });
  });

  it("does not audit a request that Better Auth rejected", async () => {
    mocks.requestEmailChange.mockRejectedValueOnce(new Error("mailer unavailable"));

    await expect(requestAccountEmailChange({ newEmail: "next@example.com" })).rejects.toThrow(
      "Verification code could not be sent.",
    );

    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("preserves the privacy-safe response for a target Better Auth accepts silently", async () => {
    mocks.requestEmailChange.mockResolvedValueOnce({ success: true });

    await expect(requestAccountEmailChange({ newEmail: "existing@example.com" })).resolves.toEqual({
      currentEmail: "owner@example.com",
      pendingEmail: "existing@example.com",
      status: "verification_required",
    });

    expect(mocks.findUnique).toHaveBeenCalledExactlyOnceWith({
      select: { email: true, emailVerified: true, publicId: true },
      where: { id: "user_1" },
    });
  });

  it("confirms the code, verifies persisted state, audits, and revalidates", async () => {
    mocks.findUnique.mockResolvedValueOnce(currentUser).mockResolvedValueOnce({
      email: "next@example.com",
      emailVerified: true,
      publicId,
    });

    const result = await confirmAccountEmailChange({
      code: "123456",
      newEmail: "next@example.com",
    });

    expect(mocks.changeEmail).toHaveBeenCalledWith({
      body: { newEmail: "next@example.com", otp: "123456" },
      headers: expect.any(Headers),
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "account.email_changed",
      actorId: "user_1",
      after: { email: "next@example.com" },
      before: { email: "owner@example.com" },
      targetId: publicId,
      targetType: "user",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/account");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/[project]/settings", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/app/[project]/settings/notifications",
      "page",
    );
    expect(result).toEqual({
      email: "next@example.com",
      emailVerification: "verified",
      status: "changed",
    });
  });

  it("does not audit success when the code is invalid or the email is already used", async () => {
    mocks.changeEmail.mockRejectedValueOnce(new Error("Email already in use"));

    await expect(
      confirmAccountEmailChange({ code: "123456", newEmail: "next@example.com" }),
    ).rejects.toThrow("The verification code is invalid or expired, or the email is unavailable.");

    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not audit success when persisted state did not change", async () => {
    await expect(
      confirmAccountEmailChange({ code: "123456", newEmail: "next@example.com" }),
    ).rejects.toThrow("Email change could not be confirmed.");

    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("never includes the verification code in audit input", async () => {
    mocks.findUnique.mockResolvedValueOnce(currentUser).mockResolvedValueOnce({
      email: "next@example.com",
      emailVerified: true,
      publicId,
    });

    await confirmAccountEmailChange({ code: "123456", newEmail: "next@example.com" });

    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("123456");
  });
});
