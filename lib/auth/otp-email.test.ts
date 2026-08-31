import { afterEach, describe, expect, it, vi } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

import { sendOtpEmail } from "./otp-email";
import { withOtpSendState } from "./otp-send-context";

function clearEmailEnv() {
  vi.stubEnv("EMAIL_PROVIDER", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("SES_REGION", "");
  vi.stubEnv("AWS_REGION", "");
  vi.stubEnv("AWS_DEFAULT_REGION", "");
}

const input = { email: "owner@example.com", otp: "482913", type: "sign-in" as const };

describe("auth OTP email", () => {
  afterEach(() => {
    sendEmailMock.mockReset();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("delivers the code through the shared email sender", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");

    await withOtpSendState({ firstRunFallback: false, sendCounterReserved: true }, () =>
      sendOtpEmail(input),
    );

    expect(sendEmailMock).toHaveBeenCalledExactlyOnceWith({
      category: "transactional",
      html: expect.stringContaining("482913"),
      sendCounterReserved: true,
      subject: "Your bisibility sign-in code",
      text: "Your bisibility code is 482913. It expires in 5 minutes.",
      to: "owner@example.com",
    });
  });

  it("subjects each verification type distinctly", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");

    await sendOtpEmail({ ...input, type: "forget-password" });
    await sendOtpEmail({ ...input, type: "change-email" });
    await sendOtpEmail({ ...input, type: "email-verification" });

    expect(sendEmailMock.mock.calls[0]?.[0]?.subject).toBe("Reset your bisibility password");
    expect(sendEmailMock.mock.calls[1]?.[0]?.subject).toBe("Confirm your new bisibility email");
    expect(sendEmailMock.mock.calls[2]?.[0]?.subject).toBe("Verify your bisibility email");
  });

  it("logs the code instead of sending when no provider is configured", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    clearEmailEnv();

    await sendOtpEmail(input);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[auth] sign-in OTP for owner@example.com: 482913");
  });

  it("rejects production sends when no mailer is configured", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    clearEmailEnv();
    vi.stubEnv("NODE_ENV", "production");

    await expect(sendOtpEmail(input)).rejects.toThrow("Configure EMAIL_PROVIDER");
    expect(info).not.toHaveBeenCalled();
  });

  it("logs the code for a production self-host first run without a mailer", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    clearEmailEnv();
    vi.stubEnv("NODE_ENV", "production");
    await withOtpSendState({ firstRunFallback: true, sendCounterReserved: false }, () =>
      sendOtpEmail(input),
    );

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenNthCalledWith(1, "[auth] sign-in OTP for owner@example.com: 482913");
    expect(info).toHaveBeenNthCalledWith(
      2,
      "Configure EMAIL_PROVIDER (resend, ses, smtp) to receive future sign-in codes by email.",
    );
  });

  it("never logs non-sign-in codes in production without a mailer", async () => {
    clearEmailEnv();
    vi.stubEnv("NODE_ENV", "production");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(sendOtpEmail({ ...input, type: "forget-password" })).rejects.toThrow(
      "Configure EMAIL_PROVIDER",
    );
    expect(info).not.toHaveBeenCalled();
  });

  it("keeps the fixed-OTP demo path alive without a mailer in production", async () => {
    vi.resetModules();
    vi.stubEnv("DEMO_FIXED_OTP", "1");
    vi.stubEnv("DEMO_INSTANCE_INSECURE_AUTH_ACK", "1");
    vi.stubEnv("NODE_ENV", "production");
    clearEmailEnv();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { sendOtpEmail: sendFixedOtpEmail } = await import("./otp-email");

    await sendFixedOtpEmail(input);

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[auth] sign-in OTP for owner@example.com: 482913");
  });
});
