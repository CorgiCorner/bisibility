import type { ProviderAllocationRow } from "@usagekit/views";
import { expect, it } from "vitest";
import {
  type AllocationNativeObservation,
  nativeAllocationAvailability,
} from "./native-allocation-evidence";

const now = Date.parse("2026-10-21T17:00:00Z");
const amount = (text: string, unit = "cents") => ({ text, unit, certainty: "measured" as const });
const row: ProviderAllocationRow = {
  id: "row",
  connectionId: "conn",
  label: "DataForSEO",
  revision: "v1",
  fundingSource: "byok",
  surface: "app",
  unit: "cents",
  limit: amount("1000"),
  unlimited: false,
  used: amount("4"),
  reserved: amount("2"),
  remaining: amount("994"),
  editable: true,
};
const observation = (text = "0.99", unit = "USD") => ({
  identity: row,
  value: amount(text, unit),
  observedAt: "2026-10-21T16:59:00Z",
  expiresAt: "2026-10-21T17:14:00Z",
});
it("uses exact native balance before reservations and proposes used plus balance", () => {
  const next = nativeAllocationAvailability(row, observation(), now);
  expect(next.outcome).toBe("ready");
  if (next.outcome !== "ready") throw new Error("Expected native evidence");
  expect(next.row.available).toEqual(amount("99"));
  expect(next.row.availabilityBasis).toBe("before_reservations");
  expect(next.limit).toBe("103");
});
it("does not warn merely because an already-spent monthly limit exceeds the provider balance", () => {
  const next = nativeAllocationAvailability({ ...row, limit: amount("103") }, observation(), now);
  expect(next.outcome === "ready" && next.exceedsProviderBalance).toBe(false);
});
it.each(["stale", "future", "revision", "unit", "unknown", "fractional"])(
  "rejects %s evidence without rounding or another read",
  (kind) => {
    const evidence: AllocationNativeObservation = observation();
    if (kind === "stale") evidence.expiresAt = "2026-10-21T17:00:00Z";
    if (kind === "future") evidence.observedAt = "2026-10-21T17:01:00Z";
    if (kind === "revision") evidence.identity = { ...row, revision: "v2" };
    if (kind === "unit") evidence.value = amount("1", "tokens");
    if (kind === "unknown") evidence.value = { text: "0.99", unit: "USD", certainty: "unknown" };
    if (kind === "fractional") evidence.value = amount("0.9901", "USD");
    expect(nativeAllocationAvailability(row, evidence, now).outcome).toBe("unavailable");
  },
);
it("allows a zero balance to suggest only valid already-used whole storage units", () => {
  const next = nativeAllocationAvailability(row, observation("0"), now);
  expect(next.outcome === "ready" && next.limit).toBe("4");
  expect(
    nativeAllocationAvailability({ ...row, used: amount("0") }, observation("0"), now).outcome,
  ).toBe("unavailable");
});
