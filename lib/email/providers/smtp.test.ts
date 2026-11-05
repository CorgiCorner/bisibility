import { EmailSendError } from "@/lib/email/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  createTransportMock.mockReset().mockReturnValue({ close: closeMock, sendMail: sendMailMock });
});

describe("smtp email provider", () => {
  afterEach(() => {
    closeMock.mockReset();
    createTransportMock.mockClear();
    sendMailMock.mockReset();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("passes one-click headers to the transport", async () => {
    sendMailMock.mockResolvedValue({});
    vi.stubEnv("SMTP_URL", "smtp://mail.example.com:1025");
    const headers = {
      "List-Unsubscribe": "<https://app.example.com/u?token=opaque>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
    await smtpEmailProvider.send({ ...message, headers });
    expect(sendMailMock.mock.calls[0]?.[0].headers).toEqual(headers);
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

    expect(createTransportMock).toHaveBeenCalledWith({
      url: "smtp://mail.example.com:1025",
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

  it("sets Reply-To when the message requests it", async () => {
    sendMailMock.mockResolvedValue({});
    vi.stubEnv("SMTP_URL", "smtp://mail.example.com:1025");

    await smtpEmailProvider.send({ ...message, replyTo: "hello@example.com" });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "hello@example.com" }),
    );
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

  it("marks a socket timeout as an ambiguous acceptance", async () => {
    const timeout = Object.assign(new Error("socket timed out"), { code: "ETIMEDOUT" });
    sendMailMock.mockRejectedValue(timeout);
    vi.stubEnv("SMTP_URL", "smtp://mail.example.com:1025");

    const error = await smtpEmailProvider.send(message).catch((caught) => caught);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ ambiguous: true, status: 500 });
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

describe("mail transport runtime compatibility", () => {
  afterEach(() => {
    createTransportMock.mockClear();
    sendMailMock.mockReset();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("applies the provider timeouts to the real SMTP transport without connecting", async () => {
    const { createTransport } = await vi.importActual<typeof import("nodemailer")>("nodemailer");
    let transportOptions: unknown;
    createTransportMock.mockImplementationOnce((options) => {
      const transport = createTransport(options);
      transportOptions = transport.options;
      return {
        close: () => transport.close(),
        sendMail: sendMailMock.mockResolvedValue({}),
      };
    });
    vi.stubEnv("SMTP_URL", "smtp://mail.example.com:1025");

    await smtpEmailProvider.send(message);

    expect(transportOptions).toMatchObject({
      connectionTimeout: 10_000,
      host: "mail.example.com",
      pool: false,
      port: 1025,
      socketTimeout: 10_000,
    });
  });

  it("serializes the complete email with the real transport without delivering it", async () => {
    const { createTransport } = await vi.importActual<typeof import("nodemailer")>("nodemailer");
    const transport = createTransport({ buffer: true, newline: "unix", streamTransport: true });
    try {
      const result = await transport.sendMail({ ...message, replyTo: "hello@example.com" });
      expect(result.envelope).toEqual({ from: "reports@example.com", to: ["owner@example.com"] });
      const serialized = result.message.toString();
      expect(serialized).toContain("Reply-To: hello@example.com");
      expect(serialized).toContain("Subject: Weekly report");
      expect(serialized).toContain("Content-Type: multipart/alternative");
      expect(serialized).toContain("Report ready");
      expect(serialized).toContain("<p>Report ready</p>");
    } finally {
      transport.close();
    }
  });

  it.each([
    {
      kind: "nested comment",
      to: "Victim (x(y) <attacker@attacker.test>) <recipient@example.com>",
      recipient: "recipient@example.com",
    },
    {
      kind: "semicolon inside a group comment",
      to: "G: (a; <attacker@attacker.test>) <recipient@example.com>;",
      recipient: "recipient@example.com",
    },
    {
      kind: "angle bracket inside a quoted local part",
      to: '<"a@attacker.test>"@example.com>',
      recipient: expect.stringMatching(/@example\.com$/),
    },
  ])("preserves the intended recipient with a $kind", async ({ to, recipient }) => {
    const { createTransport } = await vi.importActual<typeof import("nodemailer")>("nodemailer");
    const transport = createTransport({ buffer: true, streamTransport: true });
    try {
      const result = await transport.sendMail({ ...message, to });
      expect(result.envelope.to).toEqual([recipient]);
    } finally {
      transport.close();
    }
  });
});
