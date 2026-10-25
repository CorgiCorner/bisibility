import { publicProjectDefaults } from "@/lib/settings/project-defaults-config";
import { expect, it, vi } from "vitest";
import type { SettingsHostTransaction } from "./contracts";
import { defaultsReceiptSchema, readDefaultsReceipt } from "./defaults-receipt";
import { defaultsRowForTest } from "./defaults-source.test-fixture";
import { settingsHash } from "./hash";

const value = publicProjectDefaults(defaultsRowForTest(), "prj_synthetic");
const receipt = {
  revision: "0",
  sourceHash: "a".repeat(64),
  value,
  market: {
    city: null,
    country: "United States",
    device: "desktop",
    locationKey: "US",
    source: "explicit",
  },
  timestamps: { lastCheckedAt: null, nextCheckAt: null, updatedAt: new Date(0).toISOString() },
};
it("requires a valid inspection budget mode on newly written receipt values", () => {
  for (const inspectionBudgetMode of ["off", "fixed", "available_quota"])
    expect(
      defaultsReceiptSchema.parse({ ...receipt, value: { ...value, inspectionBudgetMode } }).value
        .inspectionBudgetMode,
    ).toBe(inspectionBudgetMode);
  const { inspectionBudgetMode: _mode, ...legacy } = value;
  expect(() => defaultsReceiptSchema.parse({ ...receipt, value: legacy })).toThrow();
});
it("replays legacy receipts without inserting a key or changing the receipt hash", async () => {
  const { inspectionBudgetMode: _mode, ...legacy } = value;
  const result = { ...receipt, value: legacy };
  const scope = {
    projectId: "project",
    operation: "measurement_settings.defaults",
    actorScopeHash: "actor",
    keyHash: "key",
    bodyHash: "body",
  };
  const tx = {
    measurementSettingsMutation: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ ...scope, result, resultSourceHash: result.sourceHash }),
    },
  };
  const parsed = await readDefaultsReceipt(tx as unknown as SettingsHostTransaction, scope);
  expect(parsed?.value).not.toHaveProperty("inspectionBudgetMode");
  expect(parsed).toEqual(result);
  expect(settingsHash("receipt", parsed)).toBe(settingsHash("receipt", result));
});
