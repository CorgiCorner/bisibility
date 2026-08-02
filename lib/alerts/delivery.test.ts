import { createHmac, randomBytes } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { encryptSecret } from "@/lib/providers/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAlertFiredWebhookBody,
  DeliveryHttpError,
  postSignedWebhook,
  recordDeliveryAttempt,
  sendAlertEmail,
  sendSlackAlert,
  stampWebhookDelivery,
  type TriggeredAlertDeliveryPayload,
} from "./delivery";
import { ALERT_WEBHOOK_ENVELOPE_CONTRACT } from "./webhook-envelope";

const mocks = vi.hoisted(() => ({
  agentOptions: [] as unknown[],
  prisma: {
    dailySendCounter: { upsert: vi.fn() },
    deliveryAttempt: { create: vi.fn() },
    slackConnection: { findUnique: vi.fn() },
    webhookEndpoint: { updateMany: vi.fn() },
  },
  reserveEmailDailyBudget: vi.fn(),
}));

vi.mock("undici", () => ({
  Agent: class {
    constructor(options: unknown) {
      mocks.agentOptions.push(options);
    }
    close() {
      return Promise.resolve();
    }
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/email/budget", () => ({
  reserveEmailDailyBudget: mocks.reserveEmailDailyBudget,
}));

const publicId = (prefix: string) => `${prefix}_a${"0".repeat(23)}`;
const TEST_WEBHOOK_SECRET = randomBytes(32).toString("hex");

function payload(): TriggeredAlertDeliveryPayload {
  return {
    action: "Review the keyword detail.",
    afterPosition: 14,
    alertId: publicId("al"),
    beforePosition: 8,
    conditionType: "exits_top_n",
    firedAt: "2026-06-28T10:00:00.000Z",
    headline: "Slipped out of top 10",
    keyword: "rank tracker",
    keywordId: publicId("kw"),
    projectDomain: "example.com",
    projectId: publicId("prj"),
    ruleId: publicId("alr"),
    ruleName: "Slipped",
  };
}

describe("alert delivery transports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubEnv("WEBHOOK_ALLOW_PRIVATE_NETWORK", "0");
    mocks.agentOptions.length = 0;
    mocks.reserveEmailDailyBudget.mockResolvedValue({
      day: new Date("2026-07-23T00:00:00.000Z"),
      granted: true,
      limit: 1_000,
      notificationDue: false,
    });
    mocks.prisma.deliveryAttempt.create.mockResolvedValue({});
    mocks.prisma.webhookEndpoint.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("posts alerts to Slack with the decrypted bot token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.prisma.slackConnection.findUnique.mockResolvedValue({
      accessTokenHash: encryptSecret("xoxb-alert-token"),
      channelId: "C123",
      enabled: true,
    });

    await expect(sendSlackAlert({ enabled: true, id: "slack_1" }, payload())).resolves.toBe(true);

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer xoxb-alert-token",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("pins the webhook connection to the vetted addresses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await postSignedWebhook(
      {
        hmacSecret: encryptSecret(TEST_WEBHOOK_SECRET),
        id: "webhook_1",
        url: "https://hooks.example.com/hook",
      },
      payload(),
      { resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as
      | (RequestInit & { dispatcher?: unknown })
      | undefined;
    expect(request?.dispatcher).toBeDefined();
    expect(request?.redirect).toBe("manual");
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    const options = mocks.agentOptions[0] as {
      connect: {
        lookup: (
          hostname: string,
          options: { all?: boolean },
          callback: (error: Error | null, address: unknown, family?: number) => void,
        ) => void;
      };
    };
    const callback = vi.fn();
    options.connect.lookup("hooks.example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("uses the alert.fired envelope and reports test delivery timing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T12:00:03.000Z"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const testPayload = { ...payload(), test: true };

    await expect(
      postSignedWebhook(
        {
          hmacSecret: encryptSecret(TEST_WEBHOOK_SECRET),
          id: "webhook_1",
          url: "https://hooks.example.com/hook",
        },
        testPayload,
        { resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] },
      ),
    ).resolves.toMatchObject({ latencyMs: expect.any(Number), status: 202 });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const rawBody = String(request.body);
    const expectedEnvelope = {
      created_at: "2026-07-25T12:00:03.000Z",
      data: {
        action: testPayload.action,
        after_position: testPayload.afterPosition,
        alert_id: testPayload.alertId,
        before_position: testPayload.beforePosition,
        condition_type: testPayload.conditionType,
        fired_at: testPayload.firedAt,
        headline: testPayload.headline,
        keyword: testPayload.keyword,
        keyword_id: testPayload.keywordId,
        project_domain: testPayload.projectDomain,
        project_id: testPayload.projectId,
        rule_id: testPayload.ruleId,
        rule_name: testPayload.ruleName,
        test: true,
      },
      event: "alert.fired",
      schemaVersion: 3,
    };
    expect(rawBody).toBe(JSON.stringify(expectedEnvelope));
    expect(JSON.parse(rawBody)).toEqual(expectedEnvelope);
    expect(JSON.parse(rawBody)).not.toHaveProperty("eventId");
    expect(JSON.parse(rawBody)).not.toHaveProperty("event_id");

    const sentAt = String(Math.floor(new Date("2026-07-25T12:00:03.000Z").getTime() / 1000));
    const expectedSignature = createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(`${sentAt}.${rawBody}`)
      .digest("hex");
    expect(request.headers).toMatchObject({
      "X-Bisibility-Signature": `sha256=${expectedSignature}`,
      "X-Bisibility-Timestamp": sentAt,
    });
  });

  it("keeps the alert.fired schema version in the exact typed envelope", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T12:00:03.000Z"));

    expect(buildAlertFiredWebhookBody(payload())).toEqual({
      created_at: "2026-07-25T12:00:03.000Z",
      data: expect.objectContaining({
        alert_id: publicId("al"),
        keyword_id: publicId("kw"),
        project_id: publicId("prj"),
        rule_id: publicId("alr"),
      }),
      event: "alert.fired",
      schemaVersion: 3,
    });
    expect(ALERT_WEBHOOK_ENVELOPE_CONTRACT).toEqual({
      events: {
        dailyCapReached: "alert.daily_cap_reached",
        digest: "alert.digest",
        fired: "alert.fired",
        test: "webhook.test",
      },
      schemaVersion: 3,
    });
  });

  it("blocks private webhook targets before posting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      postSignedWebhook(
        {
          hmacSecret: encryptSecret(TEST_WEBHOOK_SECRET),
          id: "webhook_1",
          url: "http://127.0.0.1/hook",
        },
        payload(),
      ),
    ).rejects.toThrow(/private-network target/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["delta seconds", "30", 30],
    ["HTTP date", "Thu, 23 Jul 2026 07:02:00 GMT", 120],
    ["past HTTP date", "Thu, 23 Jul 2026 06:59:00 GMT", null],
  ])("parses webhook Retry-After in %s form", async (_label, retryAfter, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T07:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { headers: { "Retry-After": retryAfter }, status: 429 }),
        ),
    );

    const error = await postSignedWebhook(
      {
        hmacSecret: encryptSecret(TEST_WEBHOOK_SECRET),
        id: "webhook_1",
        url: "https://hooks.example.com/hook",
      },
      payload(),
      { resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] },
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(DeliveryHttpError);
    expect(error).toMatchObject({ retryAfterSeconds: expected, status: 429 });
  });

  it.each([
    ["delta seconds", "45", 45],
    ["HTTP date", "Thu, 23 Jul 2026 07:03:00 GMT", 180],
    ["past HTTP date", "Thu, 23 Jul 2026 06:59:00 GMT", null],
  ])(
    "parses Slack Retry-After in %s form before reading JSON",
    async (_label, retryAfter, expected) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-23T07:00:00.000Z"));
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response("not json", { headers: { "Retry-After": retryAfter }, status: 429 }),
          ),
      );
      mocks.prisma.slackConnection.findUnique.mockResolvedValue({
        accessTokenHash: encryptSecret("xoxb-alert-token"),
        channelId: "C123",
        enabled: true,
      });

      const error = await sendSlackAlert({ enabled: true, id: "slack_1" }, payload()).catch(
        (caught) => caught,
      );

      expect(error).toBeInstanceOf(DeliveryHttpError);
      expect(error).toMatchObject({ retryAfterSeconds: expected, status: 429 });
    },
  );

  it("stamps successful webhook delivery without surfacing stamp failures", async () => {
    await expect(stampWebhookDelivery("webhook_1")).resolves.toBeUndefined();
    expect(mocks.prisma.webhookEndpoint.updateMany).toHaveBeenCalledWith({
      data: { lastDeliveryAt: expect.any(Date) },
      where: { id: "webhook_1" },
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.webhookEndpoint.updateMany.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    await expect(stampWebhookDelivery("webhook_1")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to stamp webhook delivery.",
      expect.objectContaining({ endpointId: "webhook_1" }),
    );
  });

  it("persists webhook endpoint identity in delivery attempts", async () => {
    await recordDeliveryAttempt("alert_1", "webhook", "failed", "rate limited", "webhook_1");

    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledWith({
      data: {
        attemptedAt: expect.any(Date),
        channel: "webhook",
        error: "rate limited",
        status: "failed",
        triggeredAlertId: "alert_1",
        webhookEndpointId: "webhook_1",
      },
    });
  });

  it("retries an endpoint FK race without the deleted endpoint id", async () => {
    mocks.prisma.deliveryAttempt.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
          clientVersion: "7.8.0",
          code: "P2003",
        }),
      )
      .mockResolvedValueOnce({});

    await expect(
      recordDeliveryAttempt("alert_1", "webhook", "sent", null, "webhook_deleted"),
    ).resolves.toBeUndefined();

    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.deliveryAttempt.create).toHaveBeenLastCalledWith({
      data: expect.not.objectContaining({ webhookEndpointId: expect.any(String) }),
    });
  });

  it("escapes HTML in alert email bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("EMAIL_FROM", "bisibility <alerts@example.com>");
    vi.stubGlobal("fetch", fetchMock);

    await sendAlertEmail("owner@example.com", {
      ...payload(),
      action: "Use <b>click</b> to review.",
      headline: "Dropped for <script>alert(1)</script>",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.html).toContain("&lt;script&gt;");
    expect(body.html).not.toContain("<script>");
    expect(mocks.prisma.dailySendCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ count: 1 }),
        update: { count: { increment: 1 } },
      }),
    );
  });

  it("uses the dedicated alerts sender with a transactional fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("EMAIL_FROM", "bisibility <reports@example.com>");
    vi.stubEnv("EMAIL_ALERTS_FROM", "bisibility alerts <alerts@example.com>");
    vi.stubGlobal("fetch", fetchMock);

    await sendAlertEmail("owner@example.com", payload());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).from).toBe(
      "bisibility alerts <alerts@example.com>",
    );

    vi.stubEnv("EMAIL_ALERTS_FROM", "");
    await sendAlertEmail("owner@example.com", payload());
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).from).toBe(
      "bisibility <reports@example.com>",
    );
  });
});
