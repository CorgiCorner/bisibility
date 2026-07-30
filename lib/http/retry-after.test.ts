import { describe, expect, it } from "vitest";
import { parseRetryAfterSeconds } from "./retry-after";

describe("Retry-After parsing", () => {
  it("parses delta seconds and HTTP dates", () => {
    const now = new Date("2026-07-23T07:00:00.000Z").getTime();

    expect(parseRetryAfterSeconds("90", now)).toBe(90);
    expect(parseRetryAfterSeconds("Thu, 23 Jul 2026 07:02:00 GMT", now)).toBe(120);
  });

  it("returns null for absent, invalid, zero, or past values", () => {
    const now = new Date("2026-07-23T07:00:00.000Z").getTime();

    expect(parseRetryAfterSeconds(null, now)).toBeNull();
    expect(parseRetryAfterSeconds("later", now)).toBeNull();
    expect(parseRetryAfterSeconds("0", now)).toBeNull();
    expect(parseRetryAfterSeconds("Thu, 23 Jul 2026 06:59:00 GMT", now)).toBeNull();
  });

  it("leaves large positive delays for the Temporal cap", () => {
    expect(parseRetryAfterSeconds("999999")).toBe(999_999);
  });
});
