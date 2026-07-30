import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { firstRunMock, reserveEmailSignInCodeMock, sendEmailMock } = vi.hoisted(() => ({
  firstRunMock: vi.fn(),
  reserveEmailSignInCodeMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/auth/first-run", () => ({ isFirstRun: firstRunMock }));
vi.mock("@/lib/auth/signin-capacity", () => ({
  reserveEmailSignInCode: reserveEmailSignInCodeMock,
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

import { sendOtpEmail } from "./otp-email";

function clearEmailEnv() {
  vi.stubEnv("EMAIL_PROVIDER", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("SES_REGION", "");
  vi.stubEnv("AWS_REGION", "");
  vi.stubEnv("AWS_DEFAULT_REGION", "");
}

const input = { email: "owner@example.com", otp: "482913", type: "sign-in" as const };

describe("auth OTP email", () => {
  beforeEach(() => {
    firstRunMock.mockResolvedValue(false);
    reserveEmailSignInCodeMock.mockResolvedValue({ gated: true, granted: true });
  });

  afterEach(() => {
    reserveEmailSignInCodeMock.mockReset();
    sendEmailMock.mockReset();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("delivers the code through the shared email sender", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");

    await sendOtpEmail(input, { fixedOtpEnabled: false });

    expect(sendEmailMock).toHaveBeenCalledExactlyOnceWith({
      category: "transactional",
      html: expect.stringContaining("482913"),
      sendCounterReserved: true,
      subject: "Your Bisibility sign-in code",
      text: "Your Bisibility code is 482913. It expires in 5 minutes.",
      to: "owner@example.com",
    });
    expect(firstRunMock).not.toHaveBeenCalled();
  });

  it("subjects each verification type distinctly", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");

    await sendOtpEmail({ ...input, type: "forget-password" }, { fixedOtpEnabled: false });
    await sendOtpEmail({ ...input, type: "change-email" }, { fixedOtpEnabled: false });

    expect(sendEmailMock.mock.calls[0]?.[0]?.subject).toBe("Reset your Bisibility password");
    expect(sendEmailMock.mock.calls[1]?.[0]?.subject).toBe("Confirm your new Bisibility email");
  });

  it("logs the code instead of sending when no provider is configured", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    clearEmailEnv();

    await sendOtpEmail(input, { fixedOtpEnabled: false });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[auth] sign-in OTP for owner@example.com: 482913");
  });

  it("still fails after setup when production has no mailer", async () => {
    clearEmailEnv();
    vi.stubEnv("NODE_ENV", "production");

    await expect(sendOtpEmail(input, { fixedOtpEnabled: false })).rejects.toThrow(
      "Configure EMAIL_PROVIDER (resend, ses, smtp) to send auth OTP email.",
    );
    expect(firstRunMock).toHaveBeenCalledOnce();
  });

  it("logs the code for a production self-host first run without a mailer", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    clearEmailEnv();
    vi.stubEnv("NODE_ENV", "production");
    firstRunMock.mockResolvedValue(true);

    await sendOtpEmail(input, { fixedOtpEnabled: false });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(reserveEmailSignInCodeMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[auth] sign-in OTP for owner@example.com: 482913");
  });

  it("does not log non-sign-in codes during first-run setup", async () => {
    clearEmailEnv();
    vi.stubEnv("NODE_ENV", "production");
    firstRunMock.mockResolvedValue(true);

    await expect(
      sendOtpEmail({ ...input, type: "forget-password" }, { fixedOtpEnabled: false }),
    ).rejects.toThrow("Configure EMAIL_PROVIDER (resend, ses, smtp) to send auth OTP email.");
  });

  it("keeps the fixed-OTP demo path alive without a mailer in production", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    clearEmailEnv();
    vi.stubEnv("NODE_ENV", "production");

    await sendOtpEmail(input, { fixedOtpEnabled: true });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[auth] sign-in OTP for owner@example.com: 482913");
  });
});
