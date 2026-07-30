import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailBudgetExceededError, EmailSendError, sendEmail } from "./send";

const { notifyOpsMock, recordResendSendMock, reserveBudgetMock, sendMock } = vi.hoisted(() => ({
  notifyOpsMock: vi.fn(),
  recordResendSendMock: vi.fn(),
  reserveBudgetMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("@/lib/ops/notify", () => ({ notifyOps: notifyOpsMock }));
vi.mock("./budget", () => ({ reserveEmailDailyBudget: reserveBudgetMock }));
vi.mock("./send-counter", () => ({ recordResendSend: recordResendSendMock }));
vi.mock("@aws-sdk/client-sesv2", () => {
  class SESv2Client {
    send = sendMock;
  }

  class SendEmailCommand {
    readonly input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  return { SESv2Client, SendEmailCommand };
});

function clearEmailEnv() {
  vi.stubEnv("EMAIL_PROVIDER", "");
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("SES_REGION", "");
}

const input = {
  category: "bulk" as const,
  html: "<p>Report ready</p>",
  subject: "Weekly report",
  text: "Report ready",
  to: "owner@example.com",
};

describe("sendEmail orchestration", () => {
  beforeEach(() => {
    reserveBudgetMock.mockResolvedValue({
      day: new Date("2026-07-23T00:00:00.000Z"),
      granted: true,
      limit: 1_000,
      notificationDue: false,
    });
    notifyOpsMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    notifyOpsMock.mockReset();
    recordResendSendMock.mockReset();
    reserveBudgetMock.mockReset();
    sendMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("re-exports the typed send error for callers", () => {
    expect(new EmailSendError("failed", 429, 30)).toMatchObject({
      retryAfterSeconds: 30,
      status: 429,
    });
    expect(
      new EmailBudgetExceededError("bulk", 1_000, new Date("2026-07-23T00:00:00.000Z")),
    ).toMatchObject({ category: "bulk", limit: 1_000 });
  });

  it("sends through the configured provider with the default sender", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("EMAIL_FROM", "Bisibility <reports@example.com>");
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(input);

    expect(reserveBudgetMock).toHaveBeenCalledWith("bulk");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      from: "Bisibility <reports@example.com>",
      to: ["owner@example.com"],
    });
  });

  it("keeps an explicit sender untouched", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("EMAIL_FROM", "Bisibility <reports@example.com>");
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ ...input, from: "Bisibility Alerts <alerts@example.com>" });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).from).toBe(
      "Bisibility Alerts <alerts@example.com>",
    );
  });

  it("routes to Amazon SES when EMAIL_PROVIDER selects it", async () => {
    const fetchMock = vi.fn();
    sendMock.mockResolvedValue({});
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("EMAIL_FROM", "Bisibility <reports@example.com>");
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(input);

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      Destination: { ToAddresses: ["owner@example.com"] },
      FromEmailAddress: "Bisibility <reports@example.com>",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unknown provider selections", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "postmark");

    await expect(sendEmail(input)).rejects.toThrow('Unknown EMAIL_PROVIDER "postmark"');
  });

  it("keeps the development no-provider fallback", async () => {
    const fetchMock = vi.fn();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    clearEmailEnv();
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ ...input, subject: "[Bisibility] Alert fired" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(reserveBudgetMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[email] Alert fired for owner@example.com");
  });

  it("refuses to run unconfigured in production", async () => {
    clearEmailEnv();
    vi.stubEnv("NODE_ENV", "production");

    await expect(sendEmail(input)).rejects.toThrow(
      "Configure EMAIL_PROVIDER (resend, ses, smtp) to send email.",
    );
    expect(reserveBudgetMock).not.toHaveBeenCalled();
  });

  it("does not reserve budget for a selected but unconfigured provider", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("EMAIL_FROM", "Bisibility <reports@example.com>");

    await expect(sendEmail(input)).rejects.toThrow("RESEND_API_KEY is required");

    expect(reserveBudgetMock).not.toHaveBeenCalled();
  });

  it("refuses an exhausted category and emits only the claimed ops notification", async () => {
    const fetchMock = vi.fn();
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("EMAIL_FROM", "Bisibility <reports@example.com>");
    vi.stubGlobal("fetch", fetchMock);
    reserveBudgetMock.mockResolvedValue({
      day: new Date("2026-07-23T00:00:00.000Z"),
      granted: false,
      limit: 12,
      notificationDue: true,
    });

    await expect(sendEmail({ ...input, category: "transactional" })).rejects.toMatchObject({
      category: "transactional",
      limit: 12,
      name: "EmailBudgetExceededError",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(notifyOpsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "email-budget:transactional:2026-07-23",
        kind: "email_daily_budget_exhausted",
      }),
    );
  });
});
