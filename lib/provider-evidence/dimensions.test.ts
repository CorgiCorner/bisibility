import { describe, expect, it } from "vitest";
import { mapStoredCostCertainty, trayDismissalExpiresAt } from "./dimensions";

describe("stored cost certainty", () => {
  it("maps measured and unknown and leaves every other certainty unclassified", () => {
    expect(mapStoredCostCertainty("measured")).toEqual({
      accounting: "measured",
      exhaustionStatus: "not_applicable",
    });
    expect(mapStoredCostCertainty("unknown")).toEqual({
      accounting: "unknown",
      exhaustionStatus: "pending",
    });
    expect(mapStoredCostCertainty("estimated")).toEqual({
      accounting: null,
      exhaustionStatus: null,
    });
  });
});

describe("tray dismissal expiry", () => {
  it("expires 15 minutes after the run finish time", () => {
    expect(trayDismissalExpiresAt(new Date("2026-10-23T06:00:00.000Z")).toISOString()).toBe(
      "2026-10-23T06:15:00.000Z",
    );
  });
});
