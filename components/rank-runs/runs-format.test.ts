import { describe, expect, it } from "vitest";
import { formatElapsed, formatPlannedDay, plannedRunDayKey } from "./runs-format";

describe("runs-format", () => {
  it("groups and formats planned times in the viewer's time zone", () => {
    const plannedFor = "2026-09-02T23:30:00.000Z";

    expect(plannedRunDayKey(plannedFor, "Europe/Warsaw")).toBe("2026-09-03");
    expect(formatPlannedDay(plannedFor, "day_first", "Europe/Warsaw")).toBe("3 Sep 2026");
    expect(formatPlannedDay(plannedFor, "iso", "Europe/Warsaw")).toBe("2026-09-03");
  });

  it("formats an active elapsed value from the passed server/client instant", () => {
    expect(formatElapsed("2026-09-02T10:00:00.000Z", null, "2026-09-02T10:01:05.000Z")).toBe(
      "1 min 5 s",
    );
  });
});
