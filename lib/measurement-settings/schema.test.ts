import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "./host/legacy-snapshot.test-fixture";
import { measurementDraftFormSchema, scheduleDraftSchema } from "./schema";

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
  it("rejects actor/auth fields in the retained historical snapshot schema", () => {
    expect(
      measurementDraftFormSchema.safeParse({
        selection: { ...fixtureSnapshot.selection, actorId: "forged" },
        schedule: fixtureSnapshot.schedule,
      }).success,
    ).toBe(false);
  });
});
