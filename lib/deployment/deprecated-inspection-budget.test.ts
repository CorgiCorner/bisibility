import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const legacyKey = ["BISIBILITY", "GSC", "INSPECTION", "DAILY", "BUDGET"].join("_");
const originalValue = process.env[legacyKey];

async function warningModule() {
  vi.resetModules();
  return import("./deprecated-inspection-budget");
}

describe("deprecated inspection-budget environment variable", () => {
  beforeEach(() => {
    delete process.env[legacyKey];
  });

  afterEach(() => {
    if (originalValue === undefined) delete process.env[legacyKey];
    else process.env[legacyKey] = originalValue;
    vi.restoreAllMocks();
  });

  it("does not warn when the legacy variable is unset", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { warnDeprecatedInspectionDailyBudget } = await warningModule();

    warnDeprecatedInspectionDailyBudget();

    expect(warning).not.toHaveBeenCalled();
  });

  it("warns once per process when the legacy variable is set", async () => {
    process.env[legacyKey] = "1";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { DEPRECATED_INSPECTION_DAILY_BUDGET_WARNING, warnDeprecatedInspectionDailyBudget } =
      await warningModule();

    warnDeprecatedInspectionDailyBudget();
    warnDeprecatedInspectionDailyBudget();

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(DEPRECATED_INSPECTION_DAILY_BUDGET_WARNING);
  });
});
