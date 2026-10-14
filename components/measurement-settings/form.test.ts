import { describe, expect, it } from "vitest";
import { explicitReviewSchema, measurementDraftFormSchema, scheduleDraftSchema } from "./form";
import { fixtureSnapshot } from "./test-fixtures";

describe("measurement form reuses existing schedule calendar vocabulary", () => {
  it("accepts canonical weekday/month-day and bounded existing jitter without manufacturing cron", () => {
    expect(scheduleDraftSchema.parse(fixtureSnapshot.schedule)).toEqual(fixtureSnapshot.schedule);
    expect(
      scheduleDraftSchema.parse({ ...fixtureSnapshot.schedule, frequency: "weekly" })
        .cronExpression,
    ).toBe("");
  });
  it.each([
    { timezone: "Not/AZone" },
    { timeOfDay: "09:15" },
    { jitterMinutes: 121 },
    { dayOfMonth: "31st" },
    { weekday: "0" },
    { frequency: "custom_cron", cronExpression: "not cron" },
  ])("rejects invalid scheduler option %j", (patch) => {
    expect(scheduleDraftSchema.safeParse({ ...fixtureSnapshot.schedule, ...patch }).success).toBe(
      false,
    );
  });
  it("requires explicit acknowledgement and rejects actor/auth fields", () => {
    expect(explicitReviewSchema.safeParse({ confirmed: false }).success).toBe(false);
    expect(explicitReviewSchema.parse({ confirmed: true })).toEqual({ confirmed: true });
    expect(
      measurementDraftFormSchema.safeParse({
        selection: { ...fixtureSnapshot.selection, actorId: "forged" },
        schedule: fixtureSnapshot.schedule,
      }).success,
    ).toBe(false);
  });
});
