import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailBudgetExceededError, EmailSendError, sendEmail } from "./send";
import { EmailNotSubmittedError, EmailProviderUnavailableError } from "./types";

const {
  notifyOpsMock,
  recordResendSendMock,
  reserveBudgetMock,
  sendMock,
  isSuppressedMock,
  recordReceiptMock,
} = vi.hoisted(() => ({
  isSuppressedMock: vi.fn(),
  recordReceiptMock: vi.fn(),
  notifyOpsMock: vi.fn(),
  recordResendSendMock: vi.fn(),
  reserveBudgetMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("./provider-feedback-store", () => ({
  assertMailNotSuppressed: async (recipient: string) => {
    if (await isSuppressedMock(recipient))
      throw new (await import("./types")).EmailSuppressedError();
  },
  recordMailReceipt: recordReceiptMock,
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: notifyOpsMock }));
vi.mock("./instance-mail-store", () => ({
  refreshInstanceMailRuntime: vi.fn(async () => undefined),
}));
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
    isSuppressedMock.mockResolvedValue(false);
    recordReceiptMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    notifyOpsMock.mockReset();
    isSuppressedMock.mockReset();
    recordReceiptMock.mockReset();
    recordResendSendMock.mockReset();
    reserveBudgetMock.mockReset();
    sendMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("serializes one-click headers through SES and excludes transactional mail", async () => {
    sendMock.mockResolvedValue({ MessageId: "ses-message" });
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("EMAIL_FROM", "reports@example.com");
    await sendEmail({
      ...input,
      listUnsubscribeUrl: "https://app.example.com/unsubscribe?token=opaque",
    });
    expect(sendMock.mock.calls[0]?.[0]?.input.Content.Simple.Headers).toEqual([
      { Name: "List-Unsubscribe", Value: "<https://app.example.com/unsubscribe?token=opaque>" },
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
    ]);
    await sendEmail({ ...input, category: "transactional" });
    expect(sendMock.mock.calls[1]?.[0]?.input.Content.Simple.Headers).toBeUndefined();
  });

  it("claims the provider send after the pre-send check and before transport", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("EMAIL_FROM", "reports@example.com");
    const order: string[] = [];
    sendMock.mockImplementation(async () => {
      order.push("provider");
      return { MessageId: "ses-message" };
    });
    await sendEmail({
      ...input,
      beforeProviderSend: async () => {
        order.push("before");
      },
      claimProviderSend: async () => {
        order.push("claim");
      },
    });
    expect(order).toEqual(["before", "claim", "provider"]);
  });

  it("does not claim a provider send when the pre-send check refuses", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("EMAIL_FROM", "reports@example.com");
    const claimProviderSend = vi.fn();
    await expect(
      sendEmail({
        ...input,
        beforeProviderSend: async () => {
          throw new Error("refused");
        },
        claimProviderSend,
      }),
    ).rejects.toThrow("refused");
    expect(claimProviderSend).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("checks the prepared message before transport and stops on refusal", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("EMAIL_FROM", "reports@example.com");
    const refusal = new Error("refused");
    await expect(
      sendEmail({
        ...input,
        beforeProviderSend: async () => {
          throw refusal;
        },
      }),
    ).rejects.toBe(refusal);
    expect(reserveBudgetMock).toHaveBeenCalledOnce();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects an insecure unsubscribe URL", async () => {
    await expect(
      sendEmail({ ...input, listUnsubscribeUrl: "http://example.com/" }),
    ).rejects.toThrow();
  });

  it.each([
    "https://user:pass@example.com/",
    "https://example.com/<bad>",
    "https://example.com/\nInjected: value",
  ])("rejects a malformed header URL %s", async (listUnsubscribeUrl) => {
    await expect(sendEmail({ ...input, listUnsubscribeUrl })).rejects.toThrow();
  });

  it("rejects unsubscribe headers on transactional mail", async () => {
    await expect(
      sendEmail({
        ...input,
        category: "transactional",
        listUnsubscribeUrl: "https://example.com/",
      }),
    ).rejects.toThrow();
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
    vi.stubEnv("EMAIL_FROM", "bisibility <reports@example.com>");
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(input);

    expect(reserveBudgetMock).toHaveBeenCalledWith("bulk");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      from: "bisibility <reports@example.com>",
      to: ["owner@example.com"],
    });
  });

  it("does not reserve the daily budget again when the caller already reserved it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("EMAIL_FROM", "bisibility <reports@example.com>");
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ ...input, dailyBudgetReserved: true });

    expect(reserveBudgetMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps an explicit sender untouched", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("EMAIL_FROM", "bisibility <reports@example.com>");
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ ...input, from: "bisibility Alerts <alerts@example.com>" });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).from).toBe(
      "bisibility Alerts <alerts@example.com>",
    );
  });

  it("passes an explicit reply address to the selected transport", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("EMAIL_FROM", "bisibility <reports@example.com>");
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ ...input, replyTo: "hello@example.com" });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      reply_to: ["hello@example.com"],
    });
  });

  it("stops suppressed bulk mail before transport and stores accepted message IDs", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("EMAIL_FROM", "reports@example.com");
    sendMock.mockResolvedValue({ MessageId: "ses-id-1" });
    isSuppressedMock.mockResolvedValueOnce(true);
    await expect(sendEmail(input)).rejects.toThrow("suppressed");
    expect(sendMock).not.toHaveBeenCalled();
    await sendEmail(input);
    expect(recordReceiptMock).toHaveBeenCalledWith({
      provider: "ses",
      messageId: "ses-id-1",
      recipient: input.to,
    });
  });

  it("checks suppression again at handoff when it changes after reservation", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("EMAIL_FROM", "reports@example.com");
    isSuppressedMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(sendEmail(input)).rejects.toThrow("suppressed");
    expect(reserveBudgetMock).toHaveBeenCalledOnce();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("marks an accepted message unknown when its receipt cannot be stored", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("EMAIL_FROM", "reports@example.com");
    sendMock.mockResolvedValue({ MessageId: "ses-id-2" });
    recordReceiptMock.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(sendEmail(input)).rejects.toMatchObject({ ambiguous: true });
    expect(sendMock).toHaveBeenCalledOnce();
    sendMock.mockResolvedValueOnce({});
    await expect(sendEmail(input)).rejects.toMatchObject({ ambiguous: true });
  });

  it("does not apply bulk suppression to transactional mail", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("EMAIL_FROM", "reports@example.com");
    isSuppressedMock.mockResolvedValue(true);
    sendMock.mockResolvedValue({ MessageId: "ses-id-3" });
    await sendEmail({ ...input, category: "transactional" });
    expect(isSuppressedMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("routes to Amazon SES when EMAIL_PROVIDER selects it", async () => {
    const fetchMock = vi.fn();
    sendMock.mockResolvedValue({ MessageId: "ses-message" });
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("EMAIL_FROM", "bisibility <reports@example.com>");
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(input);

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      Destination: { ToAddresses: ["owner@example.com"] },
      FromEmailAddress: "bisibility <reports@example.com>",
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

    await sendEmail({ ...input, subject: "[bisibility] Alert fired" });

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
    vi.stubEnv("EMAIL_FROM", "bisibility <reports@example.com>");

    await expect(sendEmail(input)).rejects.toThrow("RESEND_API_KEY is required");

    expect(reserveBudgetMock).not.toHaveBeenCalled();
  });

  it("refuses an exhausted category and emits only the claimed ops notification", async () => {
    const fetchMock = vi.fn();
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("EMAIL_FROM", "bisibility <reports@example.com>");
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

describe("required provider preflight", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each(["", "resend"])(
    "exposes provider-unavailable cause for selection %s",
    async (provider) => {
      clearEmailEnv();
      vi.stubEnv("EMAIL_PROVIDER", provider);
      const error = await sendEmail({ ...input, requireProvider: true }).catch(
        (error: unknown) => error,
      );
      expect(error).toBeInstanceOf(EmailNotSubmittedError);
      expect((error as Error).cause).toBeInstanceOf(EmailProviderUnavailableError);
      expect(sendMock).not.toHaveBeenCalled();
      expect(reserveBudgetMock).not.toHaveBeenCalled();
    },
  );

  it("does not label budget rejection as provider-unavailable", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("EMAIL_FROM", "reports@example.com");
    reserveBudgetMock.mockResolvedValue({
      granted: false,
      notificationDue: false,
      limit: 1,
      day: new Date("2026-10-24T00:00:00Z"),
    });
    const error = await sendEmail({ ...input, requireProvider: true }).catch(
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(EmailBudgetExceededError);
    expect((error as Error).cause).not.toBeInstanceOf(EmailProviderUnavailableError);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not label the demo guard as provider-unavailable", async () => {
    clearEmailEnv();
    vi.stubEnv("READ_ONLY_DEMO", "1");
    vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
    vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
    const error = await sendEmail({ ...input, requireProvider: true }).catch(
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(EmailNotSubmittedError);
    expect((error as Error).cause).toMatchObject({
      message: "Email delivery is disabled in the demo.",
    });
    expect((error as Error).cause).not.toBeInstanceOf(EmailProviderUnavailableError);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
