import { describe, expect, it } from "vitest";
import {
  annotationDayKey,
  annotationRulerPinCenter,
  annotationRulerTicks,
  layoutAnnotationRuler,
  RULER_PIN_DIAMETER,
} from "./ruler";

const start = new Date("2026-08-12T00:00:00.000Z");
const end = new Date("2026-11-10T00:00:00.000Z");

describe("layoutAnnotationRuler", () => {
  it("places month ticks and stacks pins that share a day", () => {
    const layout = layoutAnnotationRuler({
      end,
      entries: [
        { at: new Date("2026-11-07T16:02:00.000Z"), id: "deploy", marker: "D" },
        { at: new Date("2026-11-07T16:40:00.000Z"), id: "sitemap", marker: "S" },
        {
          at: new Date("2026-09-24T16:15:00.000Z"),
          endsAt: new Date("2026-10-08T08:00:00.000Z"),
          id: "google",
          marker: "G",
        },
      ],
      formatTick: (date) => annotationDayKey(date, "UTC"),
      start,
      timeZone: "UTC",
    });

    expect(layout.ticks.map((tick) => tick.label)).toEqual([
      "2026-08-12",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
      "2026-11-10",
    ]);
    const deploy = layout.pins.find((pin) => pin.ids.includes("deploy"));
    const sitemap = layout.pins.find((pin) => pin.ids.includes("sitemap"));
    expect(deploy).toBe(sitemap);
    expect(deploy?.count).toBe(2);
    expect(deploy?.marker).toBeNull();
    expect(layout.bands).toEqual([
      expect.objectContaining({
        id: "google",
        x1: expect.any(Number),
        x2: expect.any(Number),
      }),
    ]);
    const band = layout.bands[0];
    expect(band?.x2 ?? 0).toBeGreaterThan(band?.x1 ?? 1);
  });

  it("omits a band when a rollout has no end", () => {
    const ticks = annotationRulerTicks(start, end, "UTC");
    expect(ticks).toHaveLength(5);
    const layout = layoutAnnotationRuler({
      end,
      entries: [
        { at: new Date("2026-11-01T00:00:00.000Z"), endsAt: null, id: "open", marker: "G" },
      ],
      formatTick: () => "tick",
      start,
      timeZone: "UTC",
    });
    expect(layout.bands).toEqual([]);
    expect(layout.pins[0]?.x).toBeGreaterThan(0);
    expect(layout.pins[0]?.x).toBeLessThan(1);
  });

  it("keeps both end pins inside narrow and fractional container widths", () => {
    for (const width of [240, 303.6, 390, 1080]) {
      expect(annotationRulerPinCenter(0, width)).toBeGreaterThanOrEqual(RULER_PIN_DIAMETER / 2);
      expect(annotationRulerPinCenter(1, width) + RULER_PIN_DIAMETER / 2).toBeLessThanOrEqual(
        width,
      );
    }
  });

  it("keeps pin boxes from overlapping at a wide and a narrow ruler", () => {
    const entries = [
      { at: new Date("2026-11-01T00:00:00.000Z"), id: "a", marker: "N" as const },
      { at: new Date("2026-11-02T00:00:00.000Z"), id: "b", marker: "S" as const },
      { at: new Date("2026-11-04T00:00:00.000Z"), id: "c", marker: "D" as const },
    ];
    for (const width of [1440, 390]) {
      const layout = layoutAnnotationRuler({
        end,
        entries,
        formatTick: () => "tick",
        start,
        timeZone: "UTC",
        width,
      });
      const boxes = layout.pins
        .map((pin) => annotationRulerPinCenter(pin.x, width))
        .sort((left, right) => left - right);
      for (let index = 1; index < boxes.length; index += 1) {
        expect((boxes[index] ?? 0) - (boxes[index - 1] ?? 0)).toBeGreaterThanOrEqual(
          RULER_PIN_DIAMETER,
        );
      }
    }
  });
});
