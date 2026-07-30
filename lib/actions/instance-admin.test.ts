import { beforeEach, describe, expect, it, vi } from "vitest";
import { runOpsSweepNow, sendTestSlackNotification } from "./instance-admin";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  getOpsConfig: vi.fn(),
  getInstanceAdminSession: vi.fn(),
  sendTest: vi.fn(),
  sweep: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/instance-admin", () => ({
  getInstanceAdminSession: mocks.getInstanceAdminSession,
}));
vi.mock("@/lib/ops/config", () => ({ getOpsConfig: mocks.getOpsConfig }));
vi.mock("@/lib/ops/sweep", () => ({ sweepUndeliveredOpsEvents: mocks.sweep }));
vi.mock("@/lib/ops/test-notification", () => ({ sendOpsTestNotification: mocks.sendTest }));

describe("instance admin ops actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInstanceAdminSession.mockResolvedValue({ user: { id: "admin_1" } });
    mocks.consume.mockResolvedValue({
      limit: 3,
      remaining: 2,
      resetAt: Date.parse("2026-07-17T12:01:00.000Z"),
      success: true,
    });
    mocks.getOpsConfig.mockReturnValue({ enabled: true });
    mocks.sendTest.mockResolvedValue({ status: "delivered" });
    mocks.sweep.mockResolvedValue({ attempted: 4, delivered: 3 });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it.each([
    ["test notification", sendTestSlackNotification],
    ["outbox sweep", runOpsSweepNow],
  ])("gates the %s before any side effect", async (_name, action) => {
    mocks.getInstanceAdminSession.mockResolvedValueOnce(null);

    await expect(action()).resolves.toEqual({
      message: "This action is not available.",
      status: "forbidden",
    });

    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.sendTest).not.toHaveBeenCalled();
    expect(mocks.sweep).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["test notification", sendTestSlackNotification],
    ["outbox sweep", runOpsSweepNow],
  ])("fails closed when the %s limiter is unavailable", async (_name, action) => {
    mocks.consume.mockRejectedValueOnce(new Error("redis password=secret"));

    await expect(action()).resolves.toEqual({
      message: "Admin action is temporarily unavailable.",
      status: "failed",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: { result: "failed" },
        status: "failed",
        statusReason: "Instance admin action rate limiter unavailable.",
      }),
    );
    expect(mocks.sendTest).not.toHaveBeenCalled();
    expect(mocks.sweep).not.toHaveBeenCalled();
  });

  it.each([
    ["test notification", sendTestSlackNotification, "send-test-slack"],
    ["outbox sweep", runOpsSweepNow, "sweep-outbox"],
  ])("rate limits the %s per admin", async (_name, action, bucketSuffix) => {
    mocks.consume.mockResolvedValueOnce({
      limit: 3,
      remaining: 0,
      resetAt: Date.parse("2026-07-17T12:01:00.000Z"),
      success: false,
    });

    await expect(action()).resolves.toEqual({
      message: "This admin action was rate limited. Try again shortly.",
      retryAt: "2026-07-17T12:01:00.000Z",
      status: "rate_limited",
    });
    expect(mocks.consume).toHaveBeenCalledWith({
      bucketKey: `admin_1:${bucketSuffix}`,
      limit: 3,
      prefix: "bisibility:instance-admin:ops-action",
      windowSeconds: 60,
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin_1", status: "failed" }),
    );
    expect(mocks.sendTest).not.toHaveBeenCalled();
    expect(mocks.sweep).not.toHaveBeenCalled();
  });

  it("sends and audits a successful Slack test", async () => {
    await expect(sendTestSlackNotification()).resolves.toEqual({
      message: "Test notification delivered to Slack.",
      status: "delivered",
    });
    expect(mocks.sendTest).toHaveBeenCalledWith({ enabled: true });
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "instance_admin.ops_test.send",
      actorId: "admin_1",
      after: { result: "delivered" },
      targetId: "ops-slack",
      targetType: "instance_ops",
    });
  });

  it("returns and audits a Slack delivery failure without exposing configuration", async () => {
    mocks.sendTest.mockResolvedValueOnce({
      error: "Ops Slack delivery failed with status 500.",
      status: "failed",
    });

    await expect(sendTestSlackNotification()).resolves.toEqual({
      message: "Slack test delivery failed.",
      status: "delivery_failed",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: { result: "failed" },
        status: "failed",
        statusReason: "Operator Slack test delivery failed.",
      }),
    );
  });

  it("runs and audits the outbox sweep", async () => {
    await expect(runOpsSweepNow()).resolves.toEqual({
      attempted: 4,
      delivered: 3,
      message: "Outbox sweep completed: 3 of 4 delivered.",
      status: "completed",
    });
    expect(mocks.sweep).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "instance_admin.ops_sweep.run",
      actorId: "admin_1",
      after: { attempted: 4, delivered: 3, result: "completed" },
      targetId: "ops-event-outbox",
      targetType: "instance_ops",
    });
  });

  it("persists operator-only actions outside every project audit log", async () => {
    await sendTestSlackNotification();
    await runOpsSweepNow();

    expect(mocks.writeAudit).toHaveBeenCalledTimes(2);
    for (const [input] of mocks.writeAudit.mock.calls) {
      expect(input.action).toMatch(/^instance_admin\./);
      expect(input.projectId ?? null).toBeNull();
    }
  });

  it("contains sweep failures in a generic audited result", async () => {
    mocks.sweep.mockRejectedValueOnce(
      new Error("connection to https://db.example.test?token=secret failed"),
    );

    await expect(runOpsSweepNow()).resolves.toEqual({
      message: "Outbox sweep failed.",
      status: "failed",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: { result: "failed" },
        status: "failed",
        statusReason: "Operator event outbox sweep failed.",
      }),
    );
  });

  it("reports disabled Slack without entering the outbox", async () => {
    mocks.getOpsConfig.mockReturnValueOnce({ enabled: false });

    await expect(runOpsSweepNow()).resolves.toEqual({
      message: "Slack operator notifications are not configured.",
      status: "not_configured",
    });
    expect(mocks.sweep).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ after: { result: "not_configured" }, status: "failed" }),
    );
  });

  it("reports disabled Slack tests without consuming the rate limit", async () => {
    mocks.getOpsConfig.mockReturnValueOnce({ enabled: false });

    await expect(sendTestSlackNotification()).resolves.toEqual({
      message: "Slack operator notifications are not configured.",
      status: "not_configured",
    });
    expect(mocks.sendTest).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ after: { result: "not_configured" }, status: "failed" }),
    );
  });
});
