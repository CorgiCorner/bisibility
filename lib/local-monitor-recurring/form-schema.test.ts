import { describe, expect, it } from "vitest";
import { recurringFormSchema } from "./form-schema";

const input = {
  connectionId: "conn",
  scheduleId: "schedule",
  maximumPerOccurrenceUsd: "1",
  maximumTotalUsd: "100",
  maximumOccurrences: 2,
  validUntil: "2026-11-01T00:00",
};
describe("recurring draft field validation", () => {
  it.each(["", "-1", "0", "1e2", "1,00", "not-money", "9".repeat(39), "0.0000000000000000001"])(
    "returns issues rather than throwing for malformed %s",
    (value) => {
      for (const field of ["maximumTotalUsd", "maximumPerOccurrenceUsd"]) {
        expect(() => recurringFormSchema.safeParse({ ...input, [field]: value })).not.toThrow();
        const result = recurringFormSchema.safeParse({ ...input, [field]: value });
        expect(result.success).toBe(false);
        if (result.success) throw new Error("Malformed field was admitted");
        expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(true);
      }
    },
  );
  it("retains exact valid decimal ceilings and the total-at-least-one-occurrence constraint", () => {
    expect(
      recurringFormSchema.parse({
        ...input,
        maximumPerOccurrenceUsd: "0.0006",
        maximumTotalUsd: "0.0012",
      }),
    ).toMatchObject({ maximumPerOccurrenceUsd: "0.0006", maximumTotalUsd: "0.0012" });
    const result = recurringFormSchema.safeParse({ ...input, maximumTotalUsd: "0.0006" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Insufficient total was admitted");
    expect(result.error.issues.some((issue) => issue.path[0] === "maximumTotalUsd")).toBe(true);
  });
});
