import { dateOnlyFromFrozenNow } from "@/tests/clock";
import { describe, expect, it } from "vitest";
import {
  propertyDisplayName,
  propertyKind,
  resolvePeriod,
  searchInsightsProperty,
  wholeMonthsBetween,
  yoyState,
} from "./context-model";

describe("property shaping", () => {
  it("strips the request-only prefix from a domain property", () => {
    expect(propertyKind("sc-domain:example.com")).toBe("domain");
    expect(propertyDisplayName("sc-domain:example.com")).toBe("example.com");
    expect(searchInsightsProperty("sc-domain:example.com")).toEqual({
      displayName: "example.com",
      kind: "domain",
      kindLabel: "domain",
      value: "sc-domain:example.com",
    });
  });

  it("keeps a url prefix property whole", () => {
    expect(searchInsightsProperty("https://blog.example.com/")).toEqual({
      displayName: "https://blog.example.com/",
      kind: "url-prefix",
      kindLabel: "url prefix",
      value: "https://blog.example.com/",
    });
  });
});

describe("resolvePeriod", () => {
  it("accepts the three presets", () => {
    expect(resolvePeriod("7").days).toBe(7);
    expect(resolvePeriod("90").days).toBe(90);
  });

  it("falls back to 28 finalized days for anything else", () => {
    expect(resolvePeriod(undefined).id).toBe("28");
    expect(resolvePeriod("yoy").id).toBe("28");
    expect(resolvePeriod("999").id).toBe("28");
    expect(resolvePeriod("28")).toEqual({
      days: 28,
      id: "28",
      label: "28 finalized days",
      sub: "vs previous 28",
    });
  });
});

describe("wholeMonthsBetween", () => {
  it("counts only completed months", () => {
    expect(wholeMonthsBetween("2025-06-10", dateOnlyFromFrozenNow())).toBe(13);
    expect(wholeMonthsBetween("2025-06-11", dateOnlyFromFrozenNow())).toBe(12);
    expect(wholeMonthsBetween(dateOnlyFromFrozenNow(), "2025-06-10")).toBe(0);
  });
});

describe("yoyState", () => {
  const finalizedThroughDate = new Date("2026-07-08T00:00:00.000Z");

  it("stays disabled while the backfill has not reached thirteen months", () => {
    expect(
      yoyState({
        cursorDate: new Date("2025-10-08T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-08T00:00:00.000Z"),
        finalizedThroughDate,
      }),
    ).toEqual({ monthsImported: 9, required: 13 });
  });

  it("enables once the stored history covers the required months", () => {
    expect(
      yoyState({
        cursorDate: new Date("2025-03-08T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-08T00:00:00.000Z"),
        finalizedThroughDate,
      }),
    ).toEqual({ monthsImported: 16, required: 13 });
  });

  it("reports nothing imported when there is no import row", () => {
    expect(yoyState(null)).toEqual({ monthsImported: 0, required: 13 });
  });
});
