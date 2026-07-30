import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureOpsHeartbeatSchedule,
  OPS_HEARTBEAT_SCHEDULE_ID,
  OPS_HEARTBEAT_WORKFLOW_TYPE,
} from "./ops-bootstrap";

describe("ops heartbeat schedule bootstrap", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("does not create a schedule without the opt-in webhook", async () => {
    vi.stubEnv("OPS_SLACK_WEBHOOK_URL", "");
    const client = { create: vi.fn() };

    await expect(ensureOpsHeartbeatSchedule(client)).resolves.toEqual({
      scheduleId: OPS_HEARTBEAT_SCHEDULE_ID,
      status: "disabled",
    });
    expect(client.create).not.toHaveBeenCalled();
  });

  it("creates the singleton with configured cron and timezone", async () => {
    vi.stubEnv("OPS_SLACK_WEBHOOK_URL", "https://hooks.slack.test/services/test");
    vi.stubEnv("OPS_HEARTBEAT_CRON", "15 7 * * *");
    vi.stubEnv("OPS_HEARTBEAT_TZ", "America/New_York");
    const client = { create: vi.fn() };

    await expect(ensureOpsHeartbeatSchedule(client)).resolves.toEqual({
      scheduleId: OPS_HEARTBEAT_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ workflowType: OPS_HEARTBEAT_WORKFLOW_TYPE }),
        scheduleId: OPS_HEARTBEAT_SCHEDULE_ID,
        spec: {
          cronExpressions: ["15 7 * * *"],
          timezone: "America/New_York",
        },
      }),
    );
  });
});
