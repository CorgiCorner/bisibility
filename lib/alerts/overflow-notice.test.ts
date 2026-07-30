import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAlertOverflowNotice } from "./overflow-notice";

const mocks = vi.hoisted(() => ({
  postSignedBody: vi.fn(),
  notifyOps: vi.fn(),
  sendEmail: vi.fn(),
  sendSlackMessage: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: mocks.notifyOps }));
vi.mock("./delivery", () => ({
  postSignedBody: mocks.postSignedBody,
  sendSlackMessage: mocks.sendSlackMessage,
}));

const publicId = (prefix: string) => `${prefix}_a${"0".repeat(23)}`;

describe("alert overflow notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notifyOps.mockResolvedValue(undefined);
    mocks.postSignedBody.mockResolvedValue(undefined);
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.sendSlackMessage.mockResolvedValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it("does not send an email after the rule budget is exhausted", async () => {
    await sendAlertOverflowNotice({
      channels: ["email"],
      projectId: "project_1",
      projectPublicId: publicId("prj"),
      ruleId: "rule_1",
      rulePublicId: publicId("alr"),
      ruleName: "Ranking drops",
      suppressedCount: 25,
      webhooks: [],
    });

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendSlackMessage).not.toHaveBeenCalled();
    expect(mocks.postSignedBody).not.toHaveBeenCalled();
  });

  it("keeps the overflow summary on non-email channels", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T18:00:00.000Z"));
    await sendAlertOverflowNotice({
      channels: ["slack", "webhook"],
      projectId: "project_1",
      projectPublicId: publicId("prj"),
      ruleId: "rule_1",
      rulePublicId: publicId("alr"),
      ruleName: "Ranking drops",
      slackConnection: { enabled: true, id: "slack_1" },
      suppressedCount: 1,
      webhooks: [{ hmacSecret: "encrypted-secret", id: "webhook_1", url: "https://example.com" }],
    });

    expect(mocks.sendSlackMessage).toHaveBeenCalledWith(
      { enabled: true, id: "slack_1" },
      expect.stringContaining("1 alert suppressed"),
    );
    expect(mocks.postSignedBody).toHaveBeenCalledWith(
      expect.objectContaining({ id: "webhook_1" }),
      {
        created_at: "2026-07-25T18:00:00.000Z",
        data: {
          project_id: publicId("prj"),
          rule_id: publicId("alr"),
          rule_name: "Ranking drops",
          suppressed_count: 1,
        },
        event: "alert.daily_cap_reached",
        schemaVersion: 3,
      },
    );
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("logs every rejected channel with rule and endpoint context", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sendSlackMessage.mockRejectedValue(new Error("Slack unavailable"));
    mocks.postSignedBody
      .mockRejectedValueOnce(new Error("Webhook one unavailable"))
      .mockResolvedValueOnce(undefined);

    await sendAlertOverflowNotice({
      channels: ["slack", "webhook"],
      projectId: "project_1",
      projectPublicId: publicId("prj"),
      ruleId: "rule_1",
      rulePublicId: publicId("alr"),
      ruleName: "Ranking drops",
      slackConnection: { enabled: true, id: "slack_1" },
      suppressedCount: 2,
      webhooks: [
        { hmacSecret: "secret-1", id: "webhook_1", url: "https://one.example.com" },
        { hmacSecret: "secret-2", id: "webhook_2", url: "https://two.example.com" },
      ],
    });

    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith("[alerts] overflow notice delivery failed", {
      channel: "slack",
      error: "Slack unavailable",
      ruleId: "rule_1",
      webhookEndpointId: null,
    });
    expect(error).toHaveBeenCalledWith("[alerts] overflow notice delivery failed", {
      channel: "webhook",
      error: "Webhook one unavailable",
      ruleId: "rule_1",
      webhookEndpointId: "webhook_1",
    });
    expect(mocks.notifyOps).not.toHaveBeenCalled();
  });

  it("notifies ops when every attempted overflow channel fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sendSlackMessage.mockRejectedValue(new Error("Slack unavailable"));
    mocks.postSignedBody.mockRejectedValue(new Error("Webhook unavailable"));

    await sendAlertOverflowNotice({
      channels: ["slack", "webhook"],
      projectId: "project_1",
      projectPublicId: publicId("prj"),
      ruleId: "rule_1",
      rulePublicId: publicId("alr"),
      ruleName: "Ranking drops",
      slackConnection: { enabled: true, id: "slack_1" },
      suppressedCount: 2,
      webhooks: [{ hmacSecret: "secret", id: "webhook_1", url: "https://example.com" }],
    });

    expect(mocks.notifyOps).toHaveBeenCalledWith({
      dedupeKey: "alert-overflow-notice:rule_1",
      fields: { Attempts: 2, Project: "project_1", Rule: "rule_1" },
      kind: "alert_overflow_notice_failure",
      severity: "error",
      title: "Every alert overflow notice channel failed",
    });
  });
});
