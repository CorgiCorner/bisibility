import { describe, expect, it } from "vitest";
import { previousPeriod } from "./dates";
import { resolveConversionSource } from "./selection";
import type { ConversionSourceState } from "./types";

function source(
  patch: Partial<ConversionSourceState> & Pick<ConversionSourceState, "source">,
): ConversionSourceState {
  return {
    connected: false,
    conversions28: 0,
    label: patch.source === "ga4" ? "GA4" : "Plausible",
    lastDay: null,
    logoDomain: null,
    primary: false,
    reportsRevenue: false,
    ...patch,
  };
}

describe("resolveConversionSource", () => {
  it("stays on Connect when nothing is connected, even if old rows exist", () => {
    expect(
      resolveConversionSource({
        sources: [source({ lastDay: "2026-11-01", source: "ga4" })],
      }),
    ).toMatchObject({ connect: true, selected: null, showSwitch: false });
  });

  it("uses the primary connected source and hides the switch until two sources have data", () => {
    const resolved = resolveConversionSource({
      sources: [
        source({
          connected: true,
          conversions28: 4,
          lastDay: "2026-11-01",
          primary: true,
          source: "ga4",
        }),
        source({ connected: true, source: "plausible" }),
      ],
    });
    expect(resolved).toMatchObject({ connect: false, selected: "ga4", showSwitch: false });
  });

  it("offers the switch and keeps an explicit request when two sources have data", () => {
    const sources = [
      source({ connected: true, lastDay: "2026-11-01", primary: true, source: "ga4" }),
      source({ connected: true, conversions28: 2, lastDay: "2026-11-02", source: "plausible" }),
    ];
    expect(resolveConversionSource({ sources }).selected).toBe("ga4");
    expect(resolveConversionSource({ sources }).showSwitch).toBe(true);
    expect(resolveConversionSource({ requested: "plausible", sources }).selected).toBe("plausible");
    expect(resolveConversionSource({ requested: "other", sources }).selected).toBe("ga4");
  });

  it("falls through an empty primary to the connected source that has rows", () => {
    expect(
      resolveConversionSource({
        sources: [
          source({ connected: true, primary: true, source: "ga4" }),
          source({ connected: true, lastDay: "2026-11-01", source: "plausible" }),
        ],
      }).selected,
    ).toBe("plausible");
  });
});

describe("previousPeriod", () => {
  it("steps back by the same inclusive length", () => {
    expect(
      previousPeriod({
        from: new Date("2026-11-04T12:00:00.000Z"),
        to: new Date("2026-11-10T00:00:00.000Z"),
      }),
    ).toEqual({
      from: new Date("2026-10-28T00:00:00.000Z"),
      to: new Date("2026-11-03T00:00:00.000Z"),
    });
  });
});
