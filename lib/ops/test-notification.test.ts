import { beforeEach, describe, expect, it, vi } from "vitest";
import { opsTestNotificationEvent, sendOpsTestNotification } from "./test-notification";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("@/lib/ops/slack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ops/slack")>();
  return { ...actual, postOpsSlackWebhook: mocks.post };
});

describe("ops test notification", () => {
  function config(webhookUrl: string | null) {
    return {
      enabled: Boolean(webhookUrl),
      heartbeatCron: "0 8 * * *",
      heartbeatTimezone: "Europe/Warsaw",
      includeNames: false,
      notifyMode: "failures" as const,
      throttleMinutes: 60,
      webhookUrl,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not attempt delivery when operator notifications are not configured", async () => {
    await expect(sendOpsTestNotification(config(null))).resolves.toEqual({
      status: "not_configured",
    });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("delivers the shared test event", async () => {
    mocks.post.mockResolvedValue(undefined);

    await expect(
      sendOpsTestNotification(config("https://hooks.slack.com/services/test")),
    ).resolves.toEqual({ status: "delivered" });
    expect(mocks.post).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
      opsTestNotificationEvent,
    );
  });

  it("returns a redacted delivery failure without throwing", async () => {
    const webhookUrl = "https://hooks.slack.com/services/T000/B000/secret-webhook-value";
    mocks.post.mockRejectedValue(
      new Error(
        "request to https://hooks.slack.com/services/T000/B000/secret-webhook-value failed",
      ),
    );

    const result = await sendOpsTestNotification(config(webhookUrl));

    expect(result).toEqual({ error: "request to [REDACTED] failed", status: "failed" });
    expect(JSON.stringify(result)).not.toContain("secret-webhook-value");
  });
});
