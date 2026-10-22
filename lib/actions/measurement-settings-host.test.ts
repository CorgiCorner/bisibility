import { ActionPaymentError } from "@/lib/action-payment/token";
import type { PaidLaunchCommand } from "@/lib/measurement-settings/ui-contracts";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  launch: vi.fn(),
}));

vi.mock("./_shared", () => ({ getActionActor: mocks.getActor }));
vi.mock("@/lib/measurement-settings/host/launch", () => ({
  launchMeasurementSettingsHost: mocks.launch,
}));
vi.mock("@/lib/measurement-settings/host/preview", () => ({
  previewMeasurementSettingsHost: vi.fn(),
}));
vi.mock("@/lib/measurement-settings/host/read", () => ({
  readMeasurementSettingsHost: vi.fn(),
}));
vi.mock("@/lib/measurement-settings/host/save-intent", () => ({
  saveMeasurementIntentHost: vi.fn(),
}));
vi.mock("@/lib/measurement-settings/host/save-schedule", () => ({
  saveMeasurementScheduleHost: vi.fn(),
}));

import { launchMeasurementSettingsAction } from "./measurement-settings-host";

const input = { confirmed: true, idempotencyKey: "request-0001" } as PaidLaunchCommand;

describe("launchMeasurementSettingsAction payment mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActor.mockResolvedValue({ id: "user_1" });
  });

  it.each([
    ["payment_unavailable", "payment_unavailable"],
    ["payment_quote_required", "payment_unavailable"],
    ["payment_already_executed", "payment_already_executed"],
  ] as const)("maps %s to %s", async (reason, code) => {
    mocks.launch.mockRejectedValueOnce(new ActionPaymentError(reason));
    await expect(launchMeasurementSettingsAction(input)).resolves.toMatchObject({
      code,
      message: reason,
      status: "not_started",
    });
  });

  it.each(["payment_quote_expired", "payment_quote_changed"] as const)(
    "does not remap %s onto a payment block",
    async (reason) => {
      const error = new ActionPaymentError(reason);
      mocks.launch.mockRejectedValueOnce(error);
      await expect(launchMeasurementSettingsAction(input)).rejects.toBe(error);
    },
  );

  it.each([
    ["expired", "preview_expired"],
    ["mismatch", "preview_mismatch"],
  ] as const)("keeps a %s preview token on %s", async (tokenCode, code) => {
    mocks.launch.mockRejectedValueOnce(new PreviewTokenError(tokenCode));
    await expect(launchMeasurementSettingsAction(input)).resolves.toMatchObject({
      code,
      status: "not_started",
    });
  });
});
