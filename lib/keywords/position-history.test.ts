import { describe, expect, it } from "vitest";
import {
  calendarDayKey,
  dailyPositionPoints,
  earlierDayPosition,
  positionDateLabel,
} from "./position-history";

describe("position history day bucketing", () => {
  it("uses UTC calendar days for baselines and labels", () => {
    const latest = { checkedAt: new Date("2026-07-04T01:00:00.000Z"), position: 6 };
    const earlier = { checkedAt: new Date("2026-07-03T23:00:00.000Z"), position: 4 };

    expect(calendarDayKey(latest.checkedAt)).toBe("2026-07-04");
    expect(earlierDayPosition([latest, earlier], latest)).toBe(4);
    expect(positionDateLabel(latest.checkedAt, new Date("2026-07-04T23:00:00.000Z"))).toBe("Today");
    expect(positionDateLabel(earlier.checkedAt, latest.checkedAt)).toBe("Jul 3");
  });

  it.each([
    ["Pacific/Kiritimati", "Jul 4"],
    ["America/Anchorage", "Jul 3"],
  ])("keeps a 23:55Z label on its UTC day in %s", (timeZone, localLabel) => {
    const checkedAt = new Date("2026-07-03T23:55:00.000Z");
    const previousTimeZone = process.env.TZ;
    process.env.TZ = timeZone;

    try {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(timeZone);
      expect(checkedAt.toLocaleDateString("en-US", { day: "numeric", month: "short" })).toBe(
        localLabel,
      );
      expect(positionDateLabel(checkedAt, new Date("2026-07-05T12:00:00.000Z"))).toBe("Jul 3");
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });

  it("filters by whole UTC calendar days and keeps the latest check per day", () => {
    const points = [
      { checkedAt: "2026-07-13T23:59:59.999Z", id: "outside" },
      { checkedAt: "2026-07-14T00:00:00.000Z", id: "boundary" },
      { checkedAt: "2026-07-20T08:00:00.000Z", id: "earlier-today" },
      { checkedAt: "2026-07-20T18:00:00.000Z", id: "latest-today" },
    ];

    expect(
      dailyPositionPoints(points, 7, new Date("2026-07-20T23:30:00.000Z")).map((point) => point.id),
    ).toEqual(["boundary", "latest-today"]);
  });
});
