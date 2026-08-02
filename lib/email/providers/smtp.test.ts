import { EmailSendError } from "@/lib/email/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { smtpEmailProvider } from "./smtp";

const { closeMock, createTransportMock, sendMailMock } = vi.hoisted(() => ({
  closeMock: vi.fn(),
  createTransportMock: vi.fn(),
  sendMailMock: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  createTransport: createTransportMock.mockReturnValue({
    close: closeMock,
    sendMail: sendMailMock,
  }),
}));

const message = {
  from: "bisibility <reports@example.com>",
  html: "<p>Report ready</p>",
  subject: "Weekly report",
  text: "Report ready",
  to: "owner@example.com",
};

describe("smtp email provider", () => {
  afterEach(() => {
    closeMock.mockReset();
    createTransportMock.mockClear();
    sendMailMock.mockReset();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("declares its catalog identity", () => {
    expect(smtpEmailProvider.id).toBe("smtp");
    expect(smtpEmailProvider.label).toBe("SMTP");
  });

  it("is configured only when SMTP_URL is a non-empty trimmed string", () => {
    vi.stubEnv("SMTP_URL", "  ");
    expect(smtpEmailProvider.isConfigured()).toBe(false);

    vi.stubEnv("SMTP_URL", " smtp://mail.example.com:1025 ");
    expect(smtpEmailProvider.isConfigured()).toBe(true);
  });

  it("sends the complete message through a bounded non-pooled transport", async () => {
    sendMailMock.mockResolvedValue({});
    vi.stubEnv("SMTP_URL", " smtp://mail.example.com:1025 ");

    await smtpEmailProvider.send(message);

    expect(createTransportMock).toHaveBeenCalledWith("smtp://mail.example.com:1025", {
      connectionTimeout: 10_000,
      pool: false,
      socketTimeout: 10_000,
    });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: "bisibility <reports@example.com>",
      html: "<p>Report ready</p>",
      subject: "Weekly report",
      text: "Report ready",
      to: "owner@example.com",
    });
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it("maps SMTP response codes without leaking credentials", async () => {
    sendMailMock.mockRejectedValue({ responseCode: 550 });
    vi.stubEnv("SMTP_URL", "smtp://mail-user:secret-pass@mail.example.com:1025");

    const error = await smtpEmailProvider.send(message).catch((caught) => caught);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ retryAfterSeconds: null, status: 550 });
    expect(error.message).toBe("SMTP transport send failed with status 550.");
    expect(error.message).not.toContain("mail-user");
    expect(error.message).not.toContain("secret-pass");
    expect(error.message).not.toContain("mail.example.com");
  });

  it("defaults to status 500 when SMTP reports no response code", async () => {
    sendMailMock.mockRejectedValue(new Error("socket hang up"));
    vi.stubEnv("SMTP_URL", "smtp://mail.example.com:1025");

    const error = await smtpEmailProvider.send(message).catch((caught) => caught);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ retryAfterSeconds: null, status: 500 });
    expect(error.message).toBe("SMTP transport send failed with status 500.");
    expect(closeMock).toHaveBeenCalledOnce();
  });
});
