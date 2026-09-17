import { describe, expect, it } from "vitest";
import { plannedRunDayKey } from "./runs-format";

describe("runs-format", () => {
  it("groups planned times in the viewer's time zone", () => {
    const plannedFor = "2026-09-02T23:30:00.000Z";

    expect(plannedRunDayKey(plannedFor, "Europe/Warsaw")).toBe("2026-09-03");
  });
});
