import { describe, expect, it } from "vitest";
import { relativeFuture, relativePast } from "./relative-time";

const now = new Date("2026-07-03T12:00:00.000Z");

describe("relative time formatters", () => {
  it("formats past labels with the existing overview copy", () => {
    expect(relativePast(new Date("2026-07-03T11:59:30.000Z"), now)).toBe("just now");
    expect(relativePast(new Date("2026-07-03T11:42:00.000Z"), now)).toBe("18m ago");
    expect(relativePast(new Date("2026-07-03T09:00:00.000Z"), now)).toBe("3h ago");
    expect(relativePast(new Date("2026-07-02T12:00:00.000Z"), now)).toBe("yesterday");
    expect(relativePast(new Date("2026-06-25T12:00:00.000Z"), now)).toBe("8d ago");
  });

  it("formats future labels with the existing overview copy", () => {
    expect(relativeFuture(null, now)).toBe("Not scheduled");
    expect(relativeFuture(new Date("2026-07-03T11:59:00.000Z"), now)).toBe("due now");
    expect(relativeFuture(new Date("2026-07-03T12:18:00.000Z"), now)).toBe("in 18m");
    expect(relativeFuture(new Date("2026-07-03T15:00:00.000Z"), now)).toBe("in 3h");
    expect(relativeFuture(new Date("2026-07-05T12:00:00.000Z"), now)).toBe("in 2d");
  });
});
