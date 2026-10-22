import { normalizeSchedule } from "@/lib/actions/_schedule";
import { describe, expect, it } from "vitest";
import { createKeywordMembershipProjector, keywordMembershipSchedule } from "./schedule-membership";

const now = new Date("2026-10-21T06:00:00Z");
const membership = {
  archivedAt: null,
  cronExpression: null,
  enabled: true,
  frequency: "daily" as const,
  jitterMinutes: 0,
  publicId: "sch_a00000000000000000000000",
  timeOfDay: "09:00",
  timezone: "Europe/Warsaw",
};

describe("membership-authoritative keyword schedule", () => {
  it("uses the assigned schedule's local time rather than a keyword cadence mirror", () => {
    expect(keywordMembershipSchedule(membership, "keyword1", "UTC", now)).toMatchObject({
      frequency: "daily",
      nextCheckAt: new Date("2026-10-21T07:00:00Z"),
      timezone: "Europe/Warsaw",
    });
  });
  it("respects DST in the same planner calendar", () => {
    expect(
      keywordMembershipSchedule(membership, "keyword1", "UTC", new Date("2026-10-25T06:00:00Z"))
        .nextCheckAt,
    ).toEqual(new Date("2026-10-25T08:00:00Z"));
  });
  it.each([undefined, null, { ...membership, archivedAt: now }])(
    "keeps absent/archived membership manual",
    (source) => {
      expect(keywordMembershipSchedule(source, "keyword1", "UTC", now)).toMatchObject({
        frequency: "manual",
        nextCheckAt: null,
      });
    },
  );
  it("does not advertise a next check for a disabled schedule", () => {
    expect(
      keywordMembershipSchedule({ ...membership, enabled: false }, "keyword1", "UTC", now),
    ).toMatchObject({ frequency: "paused", nextCheckAt: null });
  });
  it("uses custom cron without unbounded materialization", () => {
    const projected = keywordMembershipSchedule(
      { ...membership, frequency: "custom_cron", cronExpression: "0 9 * * 1", timeOfDay: null },
      "keyword1",
      "UTC",
      now,
    );
    expect(projected.frequency).toBe("custom_cron");
    expect(projected.nextCheckAt?.getTime()).toBeGreaterThan(now.getTime());
  });
  it("keeps each projection clock and each distinct source isolated", () => {
    const first = createKeywordMembershipProjector(now);
    const nextDay = createKeywordMembershipProjector(new Date("2026-10-22T06:00:00Z"));
    expect(first(membership, "keyword1").nextCheckAt).toEqual(new Date("2026-10-21T07:00:00Z"));
    expect(nextDay(membership, "keyword1").nextCheckAt).toEqual(new Date("2026-10-22T07:00:00Z"));
    expect(first({ ...membership, timeOfDay: "10:00" }, "keyword1").nextCheckAt).toEqual(
      new Date("2026-10-21T08:00:00Z"),
    );
  });
  it("keeps Friday's keyword slot in the current Monday weekly occurrence", () => {
    const result = keywordMembershipSchedule(
      {
        ...membership,
        frequency: "weekly",
        publicId: "sch_a00000000000000000000003",
        timezone: "UTC",
        timeOfDay: null,
      },
      "keyword_3",
      "UTC",
      new Date("2026-10-21T06:00:00Z"),
    );
    expect(result.nextCheckAt).toEqual(new Date("2026-10-23T23:05:55Z"));
  });
  it("keeps the pending monthly slot anchored earlier in the current month", () => {
    const result = keywordMembershipSchedule(
      {
        ...membership,
        frequency: "monthly",
        publicId: "sch_a00000000000000000000029",
        timezone: "UTC",
        timeOfDay: null,
      },
      "keyword_2",
      "UTC",
      new Date("2026-10-21T06:00:00Z"),
    );
    expect(result.nextCheckAt).toEqual(new Date("2026-10-24T21:08:20Z"));
  });
  it("keeps 09:30 jitter pending after the 09:00 custom-cron anchor", () => {
    const result = keywordMembershipSchedule(
      {
        ...membership,
        frequency: "custom_cron",
        timezone: "UTC",
        timeOfDay: "09:00",
        cronExpression: "0 9 * * *",
        jitterMinutes: 60,
      },
      "keyword_1073",
      "UTC",
      new Date("2026-10-21T09:10:00Z"),
    );
    expect(result.nextCheckAt).toEqual(new Date("2026-10-21T09:30:00Z"));
  });
  it("retains a pending phase in a valid multi-year custom-cron interval", () => {
    const asOf = new Date("2026-10-21T09:10:00Z");
    const cronExpression = "0 0 1 2,5,11 1";
    expect(
      normalizeSchedule(
        { frequency: "custom_cron", cronExpression, jitterMinutes: 0, timezone: "UTC" },
        asOf,
      ).frequency,
    ).toBe("custom_cron");
    const result = keywordMembershipSchedule(
      {
        ...membership,
        frequency: "custom_cron",
        cronExpression,
        timezone: "UTC",
        timeOfDay: null,
        jitterMinutes: 0,
      },
      "keyword_7",
      "UTC",
      asOf,
    );
    expect(result.nextCheckAt).toEqual(new Date("2026-12-28T04:52:10Z"));
  });
  it("keeps an accepted but canonical-impossible cron readable with no next check", () => {
    const asOf = new Date("2026-10-21T09:10:00Z"),
      cronExpression = "0 0 31 2 1";
    expect(
      normalizeSchedule(
        { frequency: "custom_cron", cronExpression, jitterMinutes: 0, timezone: "UTC" },
        asOf,
      ).frequency,
    ).toBe("custom_cron");
    expect(
      keywordMembershipSchedule(
        { ...membership, frequency: "custom_cron", cronExpression },
        "keyword_1",
        "UTC",
        asOf,
      ),
    ).toMatchObject({ frequency: "custom_cron", nextCheckAt: null });
  });
});
