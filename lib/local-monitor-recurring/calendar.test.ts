import { describe, expect, it } from "vitest";
import { nextRecurringSlot, retainedRecurringSlot } from "./calendar";
import { calendar } from "./recurring.test-fixture";

describe("same-kernel frozen recurring slots", () => {
  it("keeps Warsaw wall time while physical UTC spacing crosses the autumn DST boundary", () => {
    const c = { ...calendar, timeOfDay: "04:00" };
    const first = nextRecurringSlot(c, "monitor", new Date("2026-10-24T00:00:00Z")),
      second = nextRecurringSlot(c, "monitor", first.dueAt);
    expect(first.dueAt.toISOString()).toBe("2026-10-24T02:00:00.000Z");
    expect(second.dueAt.toISOString()).toBe("2026-10-25T03:00:00.000Z");
    expect(second.dueAt.getTime() - first.dueAt.getTime()).toBe(25 * 3600000);
  });
  it("keeps Warsaw wall time across the spring23-hour day", () => {
    const c = { ...calendar, timeOfDay: "04:00" };
    const first = nextRecurringSlot(c, "monitor", new Date("2026-03-28T00:00:00Z")),
      second = nextRecurringSlot(c, "monitor", first.dueAt);
    expect(first.dueAt.toISOString()).toBe("2026-03-28T03:00:00.000Z");
    expect(second.dueAt.toISOString()).toBe("2026-03-29T02:00:00.000Z");
    expect(second.dueAt.getTime() - first.dueAt.getTime()).toBe(23 * 3600000);
  });
  it("uses one opaque calendar identity through an ambiguous local hour", () => {
    const c = { ...calendar, timeOfDay: "02:30" };
    const a = retainedRecurringSlot(c, "monitor", "2026-10-25"),
      b = retainedRecurringSlot(c, "monitor", "2026-10-25");
    expect(a.dueAt).toEqual(b.dueAt);
    expect(a.occurrenceKey).toBe("2026-10-25");
    expect(nextRecurringSlot(c, "monitor", a.dueAt).occurrenceKey).toBe("2026-10-26");
  });
  it("retains the root frequent-cron exact occurrence correction", () => {
    const c = {
      ...calendar,
      frequency: "custom_cron" as const,
      cronExpression: "* * * * *",
      timezone: "UTC",
      timeOfDay: null,
    };
    const slot = nextRecurringSlot(c, "monitor", new Date("2026-10-12T12:00:30Z"));
    expect(slot.occurrenceKey).toBe("2026-10-12T12:01:00.000Z");
    expect(retainedRecurringSlot(c, "monitor", slot.occurrenceKey).dueAt).toEqual(slot.dueAt);
  });
  it("rejects unsupported/missing timezone instead of inferring a new calendar", () =>
    expect(() =>
      nextRecurringSlot({ ...calendar, timezone: "Missing/Zone" }, "monitor", new Date()),
    ).toThrow());
});
