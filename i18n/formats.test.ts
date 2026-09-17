import { describe, expect, it } from "vitest";
import { formatCurrency, formatDateTime, formatNumber } from "./formats";

describe("locale-aware formatting foundation", () => {
  it("formats currency without converting the configured ISO amount", () => {
    expect(formatCurrency(19.99, "USD", "en")).toContain("19.99");
  });

  it("uses the explicit entity timezone instead of browser time", () => {
    const instant = new Date("2026-09-12T12:30:00.000Z");
    expect(formatDateTime(instant, { locale: "en", timeZone: "UTC" })).toContain("12:30 PM");
    expect(formatDateTime(instant, { locale: "en", timeZone: "Europe/Warsaw" })).toContain(
      "2:30 PM",
    );
  });

  it("keeps locale formatting request-local", () => {
    expect(formatNumber(1234567.89, "en")).toBe("1,234,567.89");
    expect(formatNumber(1234567.89, "pl")).not.toBe("1,234,567.89");
  });
});
