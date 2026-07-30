import { createHmac, randomBytes } from "node:crypto";
import { encryptSecret } from "@/lib/providers/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  postSignedBody,
  postSignedWebhookTest,
  type TriggeredAlertDeliveryPayload,
} from "./delivery";
import {
  buildAlertDailyCapReachedWebhookBody,
  buildAlertDigestWebhookBody,
  buildAlertFiredWebhookBody,
  buildWebhookTestBody,
} from "./webhook-envelope";

const mocks = vi.hoisted(() => ({ agentOptions: [] as unknown[] }));
const suffix = "a00000000000000000000000";
const publicId = (prefix: string) => `${prefix}_${suffix}`;
const TEST_WEBHOOK_SECRET = randomBytes(32).toString("hex");

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
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

function alert(): TriggeredAlertDeliveryPayload {
  return {
    action: "Review the ranking page.",
    afterPosition: 11,
    alertId: publicId("al"),
    beforePosition: 4,
    conditionType: "position_drop",
    firedAt: "2026-07-25T12:00:00.000Z",
    headline: "Ranking dropped",
    keyword: "rank tracker",
    keywordId: publicId("kw"),
    projectDomain: "example.com",
    projectId: publicId("prj"),
    ruleId: publicId("alr"),
    ruleName: "Ranking drops",
  };
}

function endpoint() {
  return {
    hmacSecret: encryptSecret(TEST_WEBHOOK_SECRET),
    id: "webhook_1",
    url: "https://hooks.example.com/alerts",
  };
}

describe("versioned alert webhook envelopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("builds the exact v3 digest and daily-cap envelopes", () => {
    const createdAt = "2026-07-25T18:00:00.000Z";
    const digestData = {
      alert_count: 1,
      alerts: [alert()],
      condition_type: "position_drop",
      project_domain: "example.com",
      project_id: publicId("prj"),
      rule_id: publicId("alr"),
      rule_name: "Ranking drops",
      suppressed_today_count: 2,
    };
    const dailyCapData = {
      projectId: publicId("prj"),
      ruleId: publicId("alr"),
      ruleName: "Ranking drops",
      suppressedCount: 2,
    };

    expect(buildAlertDigestWebhookBody(digestData, createdAt)).toEqual({
      created_at: createdAt,
      data: {
        ...digestData,
        alerts: [
          {
            action: "Review the ranking page.",
            after_position: 11,
            alert_id: publicId("al"),
            before_position: 4,
            condition_type: "position_drop",
            fired_at: "2026-07-25T12:00:00.000Z",
            headline: "Ranking dropped",
            keyword: "rank tracker",
            keyword_id: publicId("kw"),
            project_domain: "example.com",
            project_id: publicId("prj"),
            rule_id: publicId("alr"),
            rule_name: "Ranking drops",
          },
        ],
      },
      event: "alert.digest",
      schemaVersion: 3,
    });
    expect(buildAlertDailyCapReachedWebhookBody(dailyCapData, createdAt)).toEqual({
      created_at: createdAt,
      data: {
        project_id: publicId("prj"),
        rule_id: publicId("alr"),
        rule_name: "Ranking drops",
        suppressed_count: 2,
      },
      event: "alert.daily_cap_reached",
      schemaVersion: 3,
    });
  });

  it("rejects raw sentinel IDs before constructing an external envelope", () => {
    expect(() =>
      buildAlertFiredWebhookBody({ ...alert(), alertId: "triggered_alert_db_1" }),
    ).toThrow("v3 al public ID");
    expect(() =>
      buildAlertDailyCapReachedWebhookBody(
        {
          projectId: "project_db_1",
          ruleId: publicId("alr"),
          ruleName: "Ranking drops",
          suppressedCount: 1,
        },
        "2026-07-25T18:00:00.000Z",
      ),
    ).toThrow("v3 prj public ID");
  });

  it("builds a dedicated webhook.test envelope without fabricated alert resources", () => {
    const createdAt = "2026-07-25T18:00:00.000Z";

    expect(
      buildWebhookTestBody(
        {
          projectDomain: "example.com",
          projectId: publicId("prj"),
          webhookId: publicId("we"),
        },
        createdAt,
      ),
    ).toEqual({
      created_at: createdAt,
      data: {
        project_domain: "example.com",
        project_id: publicId("prj"),
        webhook_id: publicId("we"),
      },
      event: "webhook.test",
      schemaVersion: 3,
    });
  });

  it("posts the dedicated webhook.test envelope through the signed transport", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T18:00:00.000Z"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await postSignedWebhookTest(
      { ...endpoint(), publicId: publicId("we") },
      {
        projectDomain: "example.com",
        projectId: publicId("prj"),
        webhookId: publicId("we"),
      },
      { resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] },
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      data: {
        project_id: publicId("prj"),
        webhook_id: publicId("we"),
      },
      event: "webhook.test",
    });
    expect(body.data).not.toHaveProperty("alert_id");
    expect(body.data).not.toHaveProperty("keyword_id");
    expect(body.data).not.toHaveProperty("rule_id");
  });

  it.each([
    [
      "alert.digest",
      buildAlertDigestWebhookBody(
        {
          alert_count: 1,
          alerts: [alert()],
          condition_type: "position_drop",
          project_domain: "example.com",
          project_id: publicId("prj"),
          rule_id: publicId("alr"),
          rule_name: "Ranking drops",
          suppressed_today_count: 0,
        },
        "2026-07-25T18:00:00.000Z",
      ),
    ],
    [
      "alert.daily_cap_reached",
      buildAlertDailyCapReachedWebhookBody(
        {
          projectId: publicId("prj"),
          ruleId: publicId("alr"),
          ruleName: "Ranking drops",
          suppressedCount: 2,
        },
        "2026-07-25T18:00:00.000Z",
      ),
    ],
  ] as const)("signs exactly the versioned %s body", async (_event, envelope) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T18:00:00.000Z"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await postSignedBody(endpoint(), envelope, {
      resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const rawBody = String(request.body);
    const timestamp = "1785002400";
    const signature = createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    expect(rawBody).toBe(JSON.stringify(envelope));
    expect(request.headers).toMatchObject({
      "X-Bisibility-Signature": `sha256=${signature}`,
      "X-Bisibility-Timestamp": timestamp,
    });
  });
});
