import { EmailSendError } from "@/lib/email/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sesEmailProvider } from "./ses";

const { clientConfigs, sendMock } = vi.hoisted(() => ({
  clientConfigs: [] as unknown[],
  sendMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-sesv2", () => {
  class SESv2Client {
    constructor(config: unknown) {
      clientConfigs.push(config);
    }

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

const message = {
  from: "bisibility <reports@example.com>",
  html: "<p>Report ready</p>",
  subject: "Weekly report",
  text: "Report ready",
  to: "owner@example.com",
};

function awsError(name: string, httpStatusCode?: number) {
  const error = new Error(`${name} raised by SES`);
  error.name = name;
  return Object.assign(error, { $metadata: { httpStatusCode } });
}

describe("ses email provider", () => {
  afterEach(() => {
    clientConfigs.length = 0;
    sendMock.mockReset();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("declares its catalog identity", () => {
    expect(sesEmailProvider.id).toBe("ses");
    expect(sesEmailProvider.label).toBe("Amazon SES");
  });

  it("is configured only when a region is resolvable", () => {
    vi.stubEnv("SES_REGION", "");
    vi.stubEnv("AWS_REGION", "");
    vi.stubEnv("AWS_DEFAULT_REGION", "");
    expect(sesEmailProvider.isConfigured()).toBe(false);

    vi.stubEnv("AWS_REGION", "eu-west-1");
    expect(sesEmailProvider.isConfigured()).toBe(true);

    vi.stubEnv("SES_REGION", "eu-central-1");
    expect(sesEmailProvider.isConfigured()).toBe(true);
  });

  it("sends the message as SESv2 simple content", async () => {
    sendMock.mockResolvedValue({});
    vi.stubEnv("SES_REGION", "eu-central-1");
    vi.stubEnv("SES_CONFIGURATION_SET", "");

    await sesEmailProvider.send(message);

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0]?.[0]?.input).toEqual({
      ConfigurationSetName: undefined,
      Content: {
        Simple: {
          Body: {
            Html: { Charset: "UTF-8", Data: "<p>Report ready</p>" },
            Text: { Charset: "UTF-8", Data: "Report ready" },
          },
          Subject: { Charset: "UTF-8", Data: "Weekly report" },
        },
      },
      Destination: { ToAddresses: ["owner@example.com"] },
      FromEmailAddress: "bisibility <reports@example.com>",
    });
  });

  it("sets the monitored Reply-To address", async () => {
    sendMock.mockResolvedValue({});
    vi.stubEnv("SES_REGION", "eu-central-1");

    await sesEmailProvider.send({ ...message, replyTo: "hello@example.com" });

    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      ReplyToAddresses: ["hello@example.com"],
    });
  });

  it("creates the client with bounded latency and no internal retries", async () => {
    sendMock.mockResolvedValue({});
    vi.stubEnv("SES_REGION", "eu-north-1");

    await sesEmailProvider.send(message);

    expect(clientConfigs.at(-1)).toEqual({
      maxAttempts: 1,
      region: "eu-north-1",
      requestHandler: { requestTimeout: 10_000 },
    });
  });

  it("reuses one client per region across sends", async () => {
    sendMock.mockResolvedValue({});
    vi.stubEnv("SES_REGION", "us-east-2");

    await sesEmailProvider.send(message);
    await sesEmailProvider.send(message);

    expect(
      clientConfigs.filter((config) => (config as { region?: string }).region === "us-east-2"),
    ).toHaveLength(1);
  });

  it("tags the send with SES_CONFIGURATION_SET when present", async () => {
    sendMock.mockResolvedValue({});
    vi.stubEnv("SES_REGION", "us-west-2");
    vi.stubEnv("SES_CONFIGURATION_SET", "bisibility-transactional");

    await sesEmailProvider.send(message);

    expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
      ConfigurationSetName: "bisibility-transactional",
    });
  });

  it("throws before any request when no region is resolvable", async () => {
    vi.stubEnv("SES_REGION", "");
    vi.stubEnv("AWS_REGION", "");
    vi.stubEnv("AWS_DEFAULT_REGION", "");

    await expect(sesEmailProvider.send(message)).rejects.toThrow(
      "SES_REGION or AWS_REGION is required to send email with SES.",
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("maps SES throttling to a retryable 429 send error", async () => {
    sendMock.mockRejectedValue(awsError("TooManyRequestsException", 429));
    vi.stubEnv("SES_REGION", "eu-central-1");

    const error = await sesEmailProvider.send(message).catch((caught) => caught);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ retryAfterSeconds: null, status: 429 });
    expect(error.message).toContain("TooManyRequestsException");
  });

  it("maps SES client errors to the AWS status code", async () => {
    sendMock.mockRejectedValue(awsError("MessageRejected", 400));
    vi.stubEnv("SES_REGION", "eu-central-1");

    const error = await sesEmailProvider.send(message).catch((caught) => caught);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ retryAfterSeconds: null, status: 400 });
    expect(error.message).toContain("MessageRejected");
  });

  it("defaults to status 500 when AWS reports no HTTP status", async () => {
    sendMock.mockRejectedValue(new Error("socket hang up"));
    vi.stubEnv("SES_REGION", "eu-central-1");

    const error = await sesEmailProvider.send(message).catch((caught) => caught);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ retryAfterSeconds: null, status: 500 });
  });
});
