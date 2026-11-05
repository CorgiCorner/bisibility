import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNKNOWN_EMAIL_RESOLUTION } from "../alerts/prepared-email-delivery";
import { alertHealthActivity } from "./alert-health-activities";

const mocks = vi.hoisted(() => ({
  collectDelivery: vi.fn(),
  collectSpikes: vi.fn(),
  config: vi.fn(),
  notifyOps: vi.fn(),
  opsConfig: vi.fn(),
}));

vi.mock("../alerts/health", () => ({
  collectAlertDeliveryHealth: mocks.collectDelivery,
  collectAlertFireSpikes: mocks.collectSpikes,
  getAlertHealthConfig: mocks.config,
}));
vi.mock("../ops/config", () => ({ getOpsConfig: mocks.opsConfig }));
vi.mock("../ops/labels", () => ({ ruleLabel: (id: string) => id }));
vi.mock("../ops/notify", () => ({ notifyOps: mocks.notifyOps }));

describe("alert health activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.opsConfig.mockReturnValue({ enabled: true });
    mocks.config.mockReturnValue({ windowHours: 24 });
    mocks.collectDelivery.mockResolvedValue({
      alarm: false,
      failed: 0,
      failureRate: 0,
      perChannel: {},
      total: 12,
      windowHours: 24,
    });
    mocks.collectSpikes.mockResolvedValue([]);
    mocks.notifyOps.mockResolvedValue(undefined);
  });

  it("short-circuits while ops events are disabled", async () => {
    mocks.opsConfig.mockReturnValue({ enabled: false });
    await expect(alertHealthActivity()).resolves.toMatchObject({ status: "disabled" });
    expect(mocks.notifyOps).not.toHaveBeenCalled();
  });

  it("raises a delivery alarm with a stable dedupe key", async () => {
    mocks.collectDelivery.mockResolvedValue({
      alarm: true,
      failed: 3,
      failureRate: 0.25,
      perChannel: { email: { failed: 3, sent: 9, skipped: 4, total: 12 } },
      total: 12,
      windowHours: 24,
    });
    await alertHealthActivity();
    expect(mocks.notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "alert-health:delivery",
        fields: expect.objectContaining({ email: "3 failed / 12 attempted / 4 skipped" }),
        kind: "alert_delivery_health",
        severity: "error",
      }),
    );
  });

  it("raises one event per fire spike", async () => {
    mocks.collectSpikes.mockResolvedValue([
      { projectId: "project_1", ruleId: "rule_1", ruleName: "One", today: 30, trailingDailyAvg: 2 },
      { projectId: "project_1", ruleId: "rule_2", ruleName: "Two", today: 40, trailingDailyAvg: 3 },
    ]);
    await expect(alertHealthActivity()).resolves.toMatchObject({ spikes: 2, status: "completed" });
    expect(mocks.notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "alert-health:fire:rule_1",
        fields: expect.objectContaining({ Rule: "rule_1" }),
        kind: "alert_fire_spike",
      }),
    );
    expect(mocks.notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: "alert-health:fire:rule_2", kind: "alert_fire_spike" }),
    );
  });

  it("does not notify for healthy metrics", async () => {
    await expect(alertHealthActivity()).resolves.toMatchObject({ status: "completed" });
    expect(mocks.notifyOps).not.toHaveBeenCalled();
  });

  it("pages when an outcome is unknown without counting it as failed", async () => {
    mocks.collectDelivery.mockResolvedValue({
      alarm: false,
      failed: 0,
      failureRate: 0,
      perChannel: { email: { failed: 0, sent: 0, skipped: 0, total: 4, unknown: 4 } },
      total: 4,
      unknown: 4,
      windowHours: 24,
    });
    await expect(alertHealthActivity()).resolves.toMatchObject({
      deliveryAlarm: false,
      status: "completed",
      unknown: 4,
    });
    expect(mocks.notifyOps).toHaveBeenCalledOnce();
    expect(mocks.notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "alert-health:delivery-unknown",
        fields: expect.objectContaining({
          Resolution: UNKNOWN_EMAIL_RESOLUTION,
          Unknown: 4,
        }),
        kind: "alert_delivery_health",
        severity: "error",
        title: "Alert delivery outcome unknown",
      }),
    );
    expect(mocks.notifyOps.mock.calls[0]?.[0].fields.Failed).toBeUndefined();
  });
});
