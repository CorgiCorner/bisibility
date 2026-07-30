import { describe, expect, it } from "vitest";
import { maxConcurrentActivities } from "./worker-config";

describe("maxConcurrentActivities", () => {
  it("caps the default well below the Temporal SDK default", () => {
    expect(maxConcurrentActivities(undefined)).toBe(5);
  });

  it("accepts an explicit deployment cap", () => {
    expect(maxConcurrentActivities("10")).toBe(10);
  });

  it.each(["0", "101", "many", "1.5"])("rejects invalid value %s", (value) => {
    expect(() => maxConcurrentActivities(value)).toThrow("TEMPORAL_MAX_CONCURRENT_ACTIVITIES");
  });
});
