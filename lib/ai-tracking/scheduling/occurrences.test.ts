import { expect, it } from "vitest";
import { nextTrackingOccurrence, trackingOccurrenceKey } from "./occurrences";

it("resolves local cron across spring DST without mass missed catch-up", () => {
  const next = nextTrackingOccurrence(
    "30 2 * * *",
    "Europe/Warsaw",
    new Date("2026-03-28T12:00:00Z"),
  );
  expect(next.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  const future = nextTrackingOccurrence(
    "30 2 * * *",
    "Europe/Warsaw",
    new Date("2026-04-01T12:00:00Z"),
  );
  expect(future.toISOString()).toBe("2026-04-02T00:30:00.000Z");
});
it("keys occurrences by unique schedule and UTC instant including autumn DST", () => {
  const after = new Date("2026-10-24T12:00:00Z");
  const next = nextTrackingOccurrence("30 2 * * *", "Europe/Warsaw", after);
  expect(trackingOccurrenceKey("schedule", next)).toBe(
    `tracking-schedule:schedule:${next.toISOString()}`,
  );
  expect(nextTrackingOccurrence("30 2 * * *", "Europe/Warsaw", next).getTime()).toBeGreaterThan(
    next.getTime(),
  );
});
