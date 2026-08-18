import { getOpsConfig, shouldNotifyOpsSuccess } from "@/lib/ops/config";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("operator observability config", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off without a webhook and applies documented defaults", () => {
    vi.stubEnv("OPS_SLACK_WEBHOOK_URL", "");
    vi.stubEnv("OPS_EVENTS_ENABLED", "");
    vi.stubEnv("OPS_NOTIFY_MODE", "");
    vi.stubEnv("OPS_HEARTBEAT_CRON", "");
    vi.stubEnv("OPS_HEARTBEAT_TZ", "");
    vi.stubEnv("OPS_SLACK_INCLUDE_NAMES", "");
    vi.stubEnv("OPS_THROTTLE_MINUTES", "");

    expect(getOpsConfig()).toEqual({
      enabled: false,
      heartbeatCron: "0 8 * * *",
      heartbeatTimezone: "Etc/UTC",
      includeNames: false,
      notifyMode: "failures",
      throttleMinutes: 60,
      webhookUrl: null,
    });
  });

  it("defaults on with a webhook and supports explicit overrides", () => {
    vi.stubEnv("DEPLOYMENT_MODE", "");
    vi.stubEnv("OPS_SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/test");
    vi.stubEnv("OPS_NOTIFY_MODE", "all");
    vi.stubEnv("OPS_HEARTBEAT_CRON", "30 9 * * *");
    vi.stubEnv("OPS_HEARTBEAT_TZ", "UTC");
    vi.stubEnv("OPS_SLACK_INCLUDE_NAMES", "1");
    vi.stubEnv("OPS_THROTTLE_MINUTES", "15");

    const config = getOpsConfig();
    expect(config).toMatchObject({
      enabled: true,
      heartbeatCron: "30 9 * * *",
      heartbeatTimezone: "UTC",
      includeNames: true,
      notifyMode: "all",
      throttleMinutes: 15,
    });
    expect(shouldNotifyOpsSuccess(config)).toBe(true);
  });

  it("cannot enable storage or network work without a webhook", () => {
    expect(getOpsConfig({ OPS_EVENTS_ENABLED: "1", OPS_SLACK_WEBHOOK_URL: "" })).toMatchObject({
      enabled: false,
    });
  });

  it("never includes tenant names in managed cloud", () => {
    expect(
      getOpsConfig({
        DEPLOYMENT_MODE: "cloud",
        OPS_SLACK_INCLUDE_NAMES: "1",
        OPS_SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/test",
      }),
    ).toMatchObject({ includeNames: false });
  });
});
