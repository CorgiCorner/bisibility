import {
  DAILY_INTERVAL_MS,
  stableIntervalPhaseMs,
  WEEKLY_INTERVAL_MS,
} from "@/lib/rank-check/interval-phase";
import { describe, expect, it } from "vitest";
import { itemNotBefore, plannedOccurrenceForKey, plannedOccurrences } from "./occurrence";

const base = {
  cronExpression: null,
  frequency: "daily" as const,
  jitterMinutes: 0,
  publicId: "sch_a00000000000000000000000",
  timeOfDay: null,
  timezone: "UTC",
};

describe("planned occurrences", () => {
  it("materializes a rolling daily horizon with local calendar identity", () => {
    const occurrences = plannedOccurrences(base, new Date("2026-09-02T10:00:00.000Z"));

    expect(occurrences).toHaveLength(8);
    expect(occurrences[0]).toMatchObject({ occurrenceKey: "2026-09-02" });
    expect(occurrences.at(-1)?.plannedFor.toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });

  it("keeps an untimed daily occurrence open and clamps elapsed item phases", () => {
    const now = new Date("2026-09-02T14:00:00.000Z");
    const occurrence = plannedOccurrences(base, now, new Date("2026-09-02T23:59:59.999Z"))[0];
    if (!occurrence) throw new Error("Expected today's daily occurrence.");
    const keywordIds = Array.from({ length: 100 }, (_, index) => `keyword_${index}`);
    const elapsedId = keywordIds.find(
      (id) => stableIntervalPhaseMs(id, DAILY_INTERVAL_MS) < 14 * 60 * 60 * 1_000,
    );
    const futureId = keywordIds.find(
      (id) => stableIntervalPhaseMs(id, DAILY_INTERVAL_MS) > 14 * 60 * 60 * 1_000,
    );
    if (!elapsedId || !futureId) throw new Error("Expected phases on both sides of now.");

    expect(occurrence.occurrenceKey).toBe("2026-09-02");
    expect(itemNotBefore(occurrence, base, elapsedId, now)).toEqual(now);
    expect(itemNotBefore(occurrence, base, futureId, now)).toEqual(
      new Date(
        occurrence.plannedFor.getTime() + stableIntervalPhaseMs(futureId, DAILY_INTERVAL_MS),
      ),
    );
  });

  it("does not plan a fully elapsed daily occurrence", () => {
    const now = new Date("2026-09-02T14:00:00.000Z");
    const occurrences = plannedOccurrences(base, now, new Date("2026-09-02T23:59:59.999Z"));

    expect(occurrences.map(({ occurrenceKey }) => occurrenceKey)).toEqual(["2026-09-02"]);
    expect(occurrences).not.toContainEqual(
      expect.objectContaining({ occurrenceKey: "2026-09-01" }),
    );
  });

  it("anchors a timed schedule in its effective timezone", () => {
    const schedule = { ...base, timeOfDay: "06:00", timezone: "Europe/Warsaw" };
    const occurrence = plannedOccurrences(
      schedule,
      new Date("2026-09-02T00:00:00.000Z"),
      new Date("2026-09-03T00:00:00.000Z"),
    )[0];

    expect(occurrence?.occurrenceKey).toBe("2026-09-02");
    expect(occurrence?.plannedFor.toISOString()).toBe("2026-09-02T04:00:00.000Z");
    expect(plannedOccurrenceForKey(schedule, "2026-09-02")?.plannedFor).toEqual(
      occurrence?.plannedFor,
    );
  });

  it("uses the exact UTC cron fire as custom occurrence identity", () => {
    const occurrences = plannedOccurrences(
      { ...base, cronExpression: "0 12 * * *", frequency: "custom_cron" },
      new Date("2026-09-02T10:00:00.000Z"),
      new Date("2026-09-03T12:00:00.000Z"),
    );

    expect(occurrences.map(({ occurrenceKey }) => occurrenceKey)).toEqual([
      "2026-09-02T12:00:00.000Z",
      "2026-09-03T12:00:00.000Z",
    ]);
  });

  it("uses a persisted weekly cron for the selected Friday", () => {
    const occurrences = plannedOccurrences(
      { ...base, cronExpression: "0 6 * * 5", frequency: "weekly", timeOfDay: "06:00" },
      new Date("2026-09-03T10:00:00.000Z"),
      new Date("2026-09-10T10:00:00.000Z"),
    );

    expect(occurrences.map(({ plannedFor }) => plannedFor.toISOString())).toEqual([
      "2026-09-04T06:00:00.000Z",
    ]);
  });

  it("uses a persisted monthly cron for the selected 15th", () => {
    const occurrences = plannedOccurrences(
      { ...base, cronExpression: "0 6 15 * *", frequency: "monthly", timeOfDay: "06:00" },
      new Date("2026-09-10T10:00:00.000Z"),
      new Date("2026-09-17T10:00:00.000Z"),
    );

    expect(occurrences.map(({ plannedFor }) => plannedFor.toISOString())).toEqual([
      "2026-09-15T06:00:00.000Z",
    ]);
  });

  it("spreads null-time items and clusters timed items at the anchor", () => {
    const occurrence = plannedOccurrences(base, new Date("2026-09-02T10:00:00.000Z"))[0];
    if (!occurrence) throw new Error("Expected a daily occurrence.");
    const spreadA = itemNotBefore(occurrence, base, "keyword_1", occurrence.plannedFor);
    const spreadB = itemNotBefore(occurrence, base, "keyword_2", occurrence.plannedFor);
    const timed = itemNotBefore(
      occurrence,
      { jitterMinutes: 0, timeOfDay: "06:00" },
      "keyword_1",
      occurrence.plannedFor,
    );

    expect(spreadA).not.toEqual(spreadB);
    expect(spreadA.getTime()).toBeGreaterThanOrEqual(occurrence.plannedFor.getTime());
    expect(spreadA.getTime()).toBeLessThan(occurrence.plannedFor.getTime() + occurrence.intervalMs);
    expect(timed).toEqual(occurrence.plannedFor);
  });

  it("keeps stable spread slots inside every occurrence window", () => {
    const plannedFor = new Date("2026-09-04T00:00:00.000Z");
    const intervals = [
      60_000,
      5 * 60_000,
      60 * 60_000,
      DAILY_INTERVAL_MS,
      WEEKLY_INTERVAL_MS,
      31 * DAILY_INTERVAL_MS,
    ];
    const keywordIds = Array.from({ length: 256 }, (_, index) => `keyword_${index}`);

    for (const intervalMs of intervals) {
      const occurrence = { intervalMs, occurrenceKey: "window", plannedFor };
      const windowEnd = plannedFor.getTime() + intervalMs;
      for (const keywordId of keywordIds) {
        const slot = itemNotBefore(
          occurrence,
          { jitterMinutes: 120, timeOfDay: null },
          keywordId,
          plannedFor,
        );

        expect(slot.getTime()).toBeGreaterThanOrEqual(plannedFor.getTime());
        expect(slot.getTime()).toBeLessThan(windowEnd);
        expect(
          itemNotBefore(occurrence, { jitterMinutes: 120, timeOfDay: null }, keywordId, plannedFor),
        ).toEqual(slot);
      }
    }
  });

  it.each(["paused", "manual"] as const)("does not plan %s schedules", (frequency) => {
    expect(plannedOccurrences({ ...base, frequency }, new Date())).toEqual([]);
  });
});
