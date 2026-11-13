import { describe, expect, it } from "vitest";
import { isoDayKey } from "./day-key";

describe("iso day key", () => {
  it("uses the document time zone", () => {
    const instant = new Date("2026-01-02T23:30:00.000Z");
    expect(isoDayKey("UTC", instant)).toBe("2026-01-02");
    expect(isoDayKey("Pacific/Kiritimati", instant)).toBe("2026-01-03");
  });
});
