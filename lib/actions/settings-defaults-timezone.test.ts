import {
  getSettingsActionMocks,
  resetSettingsActionMocks,
  settingsScheduleInput,
} from "@/lib/actions/settings-test-harness";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { reviewedDefaultsWriterFixture } from "./defaults-reviewed.test-fixture";

vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-writer-fixture-key-only-000")],
}));

const settingsActionMocks = getSettingsActionMocks();
let actions: typeof import("@/lib/actions/settings");

beforeAll(async () => {
  actions = await import("@/lib/actions/settings");
});

describe("settings default timezone actions", () => {
  beforeEach(resetSettingsActionMocks);
  afterEach(() => vi.useRealTimers());

  it("returns a typed invalid-settings result before database mutation", async () => {
    await expect(
      actions.updateDefaultRankCheckSettings(settingsScheduleInput({ timezone: "Etc/GMT+5" })),
    ).resolves.toMatchObject({ kind: "not_saved", code: "invalid_settings", nextCheckAt: null });
    expect(settingsActionMocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(settingsActionMocks.writeAudit).not.toHaveBeenCalled();
  });

  it("requires a reviewed preview for valid settings before mutation", async () => {
    await expect(
      actions.updateDefaultRankCheckSettings(settingsScheduleInput()),
    ).resolves.toMatchObject({ kind: "not_saved", code: "preview_required", nextCheckAt: null });
    expect(settingsActionMocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(settingsActionMocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects an invalid timezone before database mutation with a Zod issue", async () => {
    let caught: unknown;
    try {
      await reviewedDefaultsWriterFixture(
        settingsScheduleInput({ timezone: "Etc/GMT+5" }),
        "settings.defaults.update",
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ZodError);
    expect((caught as ZodError).issues.some((issue) => issue.path.includes("timezone"))).toBe(true);
    expect(settingsActionMocks.prisma.projectDefaults.upsert).not.toHaveBeenCalled();
    expect(settingsActionMocks.writeAudit).not.toHaveBeenCalled();
  });

  it("stores a timezone-specific next run for a custom cron that differs from UTC", async () => {
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));
    const nextRunFor = async (timezone: string) => {
      await reviewedDefaultsWriterFixture(
        settingsScheduleInput({ cronExpression: "0 8 * * *", frequency: "custom_cron", timezone }),
        "settings.defaults.update",
      );
      const nextCheckAt = settingsActionMocks.prisma.projectDefaults.upsert.mock.calls.at(-1)?.[0]
        ?.create?.nextCheckAt as Date;
      return nextCheckAt;
    };

    const madridNext = await nextRunFor("Europe/Madrid");
    const utcNext = await nextRunFor("UTC");

    expect(madridNext.toISOString()).toBe("2026-08-11T06:00:00.000Z");
    expect(utcNext.toISOString()).toBe("2026-08-11T08:00:00.000Z");
    expect(madridNext.getTime()).not.toBe(utcNext.getTime());
  });
});
