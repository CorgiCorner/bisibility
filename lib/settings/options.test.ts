import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import { describe, expect, it } from "vitest";
import {
  type DefaultsData,
  frequencyOptions,
  getInspectionSchedulePreview,
  getRankSchedulePreview,
} from "./options";

const defaults: DefaultsData = {
  city: null,
  costPerCheck: 0.0155,
  country: "Poland",
  device: "Desktop",
  deviceCount: 1,
  inspectionDailyLimit: 50,
  keywordCount: 1,
  locationCount: 1,
  locationKey: "PL",
  locationLabel: "Poland",
  schedule: {
    cron_expression: null,
    frequency: "daily",
    jitter_minutes: 60,
    last_checked_at: null,
    next_check_at: null,
    timezone: "Europe/Warsaw",
  },
  serpDepth: 100,
  serpStopOnMatch: true,
  targetUrlCount: 0,
};

function rankPreview(frequency: DefaultsData["schedule"]["frequency"], timezone = "Europe/Warsaw") {
  return getRankSchedulePreview({
    cronExpression: "0 6 * * *",
    defaults,
    frequency,
    referenceIso: "2026-07-28T00:00:00.000Z",
    timezone,
  });
}

describe("frequencyOptions", () => {
  it("offers monthly frequency after weekly", () => {
    expect(frequencyOptions.map(({ value }) => value)).toEqual([
      "daily",
      "weekly",
      "monthly",
      "manual",
      "paused",
      "custom_cron",
    ]);
  });
});

describe("getInspectionSchedulePreview", () => {
  it.each([
    { days: 0, limit: 50, urls: 0 },
    { days: 1, limit: 50, urls: 50 },
    { days: 2, limit: 50, urls: 51 },
    { days: 4, limit: 25, urls: 100 },
  ])("maps $urls URLs at limit $limit to $days days", ({ days, limit, urls }) => {
    expect(getInspectionSchedulePreview(urls, limit).daysPerInspection).toBe(days);
  });

  it("reports no rotation interval when inspections are disabled", () => {
    expect(getInspectionSchedulePreview(10, 0).daysPerInspection).toBeNull();
  });
});

describe("getRankSchedulePreview", () => {
  it.each([
    ["daily", "Every 24 hours per keyword on a stable distributed phase."],
    ["weekly", "Every 7 days per keyword on a stable distributed phase."],
  ] as const)(
    "describes %s as a per-keyword cadence without a fabricated time",
    (frequency, copy) => {
      const preview = rankPreview(frequency);

      expect(preview.humanPreview).toBe(copy);
      expect(preview.nextRunLabels).toEqual([]);
      expect(`${preview.humanPreview} ${preview.nextRunLabels.join(" ")}`).not.toMatch(
        /06:00|Europe\/Warsaw/,
      );
    },
  );

  it.each(["daily", "weekly"] as const)(
    "does not change the %s cadence preview with timezone",
    (frequency) => {
      const warsaw = rankPreview(frequency, "Europe/Warsaw");
      const utc = rankPreview(frequency, "UTC");

      expect({
        humanPreview: warsaw.humanPreview,
        nextRunLabels: warsaw.nextRunLabels,
      }).toEqual({
        humanPreview: utc.humanPreview,
        nextRunLabels: utc.nextRunLabels,
      });
    },
  );

  it("keeps monthly and custom cron copy anchored to timezone", () => {
    expect(rankPreview("monthly").humanPreview).toBe(
      "Monthly per keyword, anchored to its wall-clock date and time in Europe/Warsaw.",
    );
    expect(rankPreview("monthly").nextRunLabels).toEqual([]);

    const custom = rankPreview("custom_cron");
    const next = computeNextCheckAt(
      {
        cronExpression: "0 6 * * *",
        frequency: "custom_cron",
        timezone: "Europe/Warsaw",
      },
      new Date("2026-07-28T00:00:00.000Z"),
    );
    expect(custom.humanPreview).toBe("Runs every day at 06:00 Europe/Warsaw");
    expect(next).toEqual(new Date("2026-07-28T04:00:00.000Z"));
    expect(custom.nextRunLabels[0]).toBe("Jul 28, 06:00");
  });

  it.each([
    ["*/15 6 * * *", 120],
    ["5,10 6-7 * * 1", 16],
  ] as const)(
    "previews runtime-valid cron expression %s with matching next runs",
    (cronExpression, expectedRunsPerMonth) => {
      const reference = new Date("2026-07-28T00:00:00.000Z");
      const preview = getRankSchedulePreview({
        cronExpression,
        defaults,
        frequency: "custom_cron",
        referenceIso: reference.toISOString(),
        timezone: "Europe/Warsaw",
      });
      const expected: string[] = [];
      let cursor = reference;
      while (expected.length < 3) {
        const next = computeNextCheckAt(
          { cronExpression, frequency: "custom_cron", timezone: "Europe/Warsaw" },
          cursor,
        );
        expect(next).not.toBeNull();
        expected.push(
          new Intl.DateTimeFormat("en-US", {
            day: "numeric",
            hour: "2-digit",
            hourCycle: "h23",
            minute: "2-digit",
            month: "short",
            timeZone: "Europe/Warsaw",
          })
            .format(next as Date)
            .replace(" at", ","),
        );
        cursor = next as Date;
      }

      expect(preview.parsedCron.ok).toBe(true);
      expect(preview.nextRunLabels).toEqual(expected);
      expect(preview.monthlyChecks).toBe(expectedRunsPerMonth);
      expect(preview.monthlyCost).not.toBeNull();
      expect(preview.humanPreview).toBe("Runs on the custom cron schedule in Europe/Warsaw.");
    },
  );
});
