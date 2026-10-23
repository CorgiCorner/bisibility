import { ScheduleOverlapPolicy } from "@temporalio/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRankCheckScheduleOptions,
  buildRankCheckScheduleSpec,
} from "./legacy-schedule-builder";
import { computeNextCheckAt } from "./schedule";

const scheduledInput = {
  keywordId: "keyword_1",
  projectId: "project_1",
  providerId: "dataforseo",
  schedule: {
    cronExpression: null,
    frequency: "daily",
    jitterMinutes: 60,
    timezone: "Europe/Warsaw",
  },
} as const;

describe("Temporal rank-check schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
  });

  it("builds a searchable stable schedule action", () => {
    const options = buildRankCheckScheduleOptions(scheduledInput);

    expect(options.scheduleId).toBe("rank-check-keyword_1");
    expect(options.action.workflowId).toBe("rank-check-keyword_1");
    expect(options.action.workflowType).toBe("rankCheckWorkflow");
    expect(options.action.args).toEqual([{ keywordId: "keyword_1", providerId: "dataforseo" }]);
    expect(options.typedSearchAttributes).toEqual([
      { key: { name: "keywordId", type: "KEYWORD" }, value: "keyword_1" },
      { key: { name: "projectId", type: "KEYWORD" }, value: "project_1" },
      { key: { name: "provider", type: "KEYWORD" }, value: "dataforseo" },
    ]);
    expect(options.action.typedSearchAttributes).toEqual(options.typedSearchAttributes);
    expect(options.policies?.overlap).toBe(ScheduleOverlapPolicy.SKIP);
  });

  it("converts built-in frequencies and custom cron to Temporal specs", () => {
    expect(buildRankCheckScheduleSpec(scheduledInput.schedule, scheduledInput.keywordId)).toEqual({
      intervals: [{ every: "1 day", offset: expect.any(Number) }],
      jitter: 3_600_000,
      timezone: "Europe/Warsaw",
    });
    expect(
      buildRankCheckScheduleSpec(
        {
          cronExpression: "15 6 * * 1",
          frequency: "custom_cron",
          jitterMinutes: 0,
          timezone: "Europe/Warsaw",
        },
        scheduledInput.keywordId,
      ),
    ).toEqual({
      cronExpressions: ["15 6 * * 1"],
      timezone: "Europe/Warsaw",
    });
    expect(
      buildRankCheckScheduleSpec(
        { frequency: "daily", jitterMinutes: 0, timezone: "UTC" },
        scheduledInput.keywordId,
      ),
    ).not.toHaveProperty("jitter");
  });

  it("derives stable bounded daily and weekly offsets from the keyword ID", () => {
    const offsetFor = (frequency: "daily" | "weekly", keywordId: string) => {
      const spec = buildRankCheckScheduleSpec(
        { frequency, jitterMinutes: 60, timezone: "UTC" },
        keywordId,
      );
      return "intervals" in spec ? spec.intervals[0]?.offset : undefined;
    };

    const dailyOffset = offsetFor("daily", "keyword_1");
    expect(dailyOffset).toBe(offsetFor("daily", "keyword_1"));
    expect(dailyOffset).not.toBe(offsetFor("daily", "keyword_2"));
    expect(dailyOffset).toBeGreaterThanOrEqual(0);
    expect(dailyOffset).toBeLessThan(24 * 60 * 60 * 1_000);

    const weeklyOffset = offsetFor("weekly", "keyword_1");
    expect(weeklyOffset).toBe(offsetFor("weekly", "keyword_1"));
    expect(weeklyOffset).not.toBe(offsetFor("weekly", "keyword_2"));
    expect(weeklyOffset).toBeGreaterThanOrEqual(0);
    expect(weeklyOffset).toBeLessThan(7 * 24 * 60 * 60 * 1_000);
  });

  it("aligns persisted daily and weekly next times with Temporal interval phases", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    for (const [frequency, intervalMs] of [
      ["daily", 24 * 60 * 60 * 1_000],
      ["weekly", 7 * 24 * 60 * 60 * 1_000],
    ] as const) {
      const spec = buildRankCheckScheduleSpec(
        { frequency, jitterMinutes: 60, timezone: "UTC" },
        scheduledInput.keywordId,
      );
      const offset = "intervals" in spec ? spec.intervals[0]?.offset : undefined;
      const next = computeNextCheckAt(
        { frequency, jitterMinutes: 60, timezone: "UTC" },
        from,
        scheduledInput.keywordId,
      );

      expect(next).not.toBeNull();
      expect(offset).toBeDefined();
      expect((next as Date).getTime() % intervalMs).toBe(offset);
      expect(
        computeNextCheckAt(
          { frequency, jitterMinutes: 60, timezone: "UTC" },
          from,
          scheduledInput.keywordId,
        ),
      ).toEqual(next);
    }
  });

  it("converts monthly frequency to a clamped wall-clock cron spec", () => {
    expect(
      buildRankCheckScheduleSpec(
        {
          frequency: "monthly",
          jitterMinutes: 0,
          nextCheckAt: new Date("2026-01-31T06:30:00.000Z"),
          timezone: "UTC",
        },
        scheduledInput.keywordId,
      ),
    ).toEqual({
      cronExpressions: ["30 6 28 * *"],
      timezone: "UTC",
    });
  });
});
