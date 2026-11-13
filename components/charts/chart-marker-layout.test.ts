import type { ChartMarker } from "@/lib/annotations/marker-style";
import { describe, expect, it } from "vitest";
import {
  CHART_MARKER_PIN_RADIUS,
  chartMarkerGuideLine,
  layoutChartMarkers,
} from "./chart-marker-layout";

const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];

function marker(
  overrides: Partial<ChartMarker> & Pick<ChartMarker, "id" | "kind" | "dateKey">,
): ChartMarker {
  return { title: overrides.id, ...overrides };
}

describe("layoutChartMarkers", () => {
  it("places lettered pins on their day and clusters several markers into one pin", () => {
    const layout = layoutChartMarkers(days, [
      marker({ dateKey: "2026-11-02", id: "note", kind: "note", title: "FAQ" }),
      marker({ dateKey: "2026-11-02", id: "deploy", kind: "deploy", title: "Ship" }),
      marker({ dateKey: "2026-11-05", id: "sitemap", kind: "sitemap", title: "Sitemap" }),
      marker({ dateKey: "2026-10-01", id: "outside", kind: "content", title: "Too early" }),
    ]);

    expect(layout.pins).toEqual([
      expect.objectContaining({
        count: 2,
        dateKey: "2026-11-02",
        index: 1,
        kind: null,
        letter: null,
        markers: [
          expect.objectContaining({ id: "note", title: "FAQ" }),
          expect.objectContaining({ id: "deploy", title: "Ship" }),
        ],
      }),
      expect.objectContaining({
        count: 1,
        dateKey: "2026-11-05",
        index: 4,
        kind: "sitemap",
        letter: "S",
      }),
    ]);
    expect(layout.bands).toEqual([]);
    expect(layout.byIndex.get(1)?.map((item) => item.id)).toEqual(["note", "deploy"]);
  });

  it("clips a rollout band to the plotted days and pins it at the visible start", () => {
    const layout = layoutChartMarkers(days, [
      marker({
        dateKey: "2026-10-28",
        endDateKey: "2026-11-03",
        id: "google",
        kind: "search_engine",
        title: "Spam update",
      }),
      marker({
        dateKey: "2026-11-08",
        endDateKey: "2026-11-12",
        id: "later",
        kind: "search_engine",
        title: "After the chart",
      }),
    ]);

    expect(layout.bands).toEqual([
      { endIndex: 2, id: "google", kind: "search_engine", startIndex: 0 },
    ]);
    expect(layout.pins).toEqual([
      expect.objectContaining({ dateKey: "2026-11-01", index: 0, letter: "G" }),
    ]);
    expect(layout.byIndex.get(2)?.map((item) => item.id)).toEqual(["google"]);
    expect(layout.byIndex.has(4)).toBe(false);
  });

  it("returns an empty layout when the chart has no markers", () => {
    expect(layoutChartMarkers(days, [])).toEqual({ bands: [], byIndex: new Map(), pins: [] });
  });

  it("drops a guide from the pin bottom to the baseline at the pin centre", () => {
    expect(chartMarkerGuideLine({ baselineY: 180, cx: 40, cy: 12 })).toEqual({
      x: 40,
      y1: 12 + CHART_MARKER_PIN_RADIUS,
      y2: 180,
    });
  });
});

// jsdom has no glyph measurement. Read the shipped font's cap and ink metrics instead.
it("centres capital and digit ink within half a pixel at 1x and 2x", async () => {
  const { readFileSync } = await import("node:fs");
  const { MARKER_CAP_BASELINE, MARKER_INK_BEARINGS, markerInkXOffset } = await import(
    "@/components/annotations/AnnotationMarkerBadge"
  );
  const font = readFileSync("node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf");
  const tables = new Map<string, number>();
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    const at = 12 + i * 16;
    tables.set(font.toString("ascii", at, at + 4), font.readUInt32BE(at + 8));
  }
  const head = tables.get("head") ?? 0;
  const units = font.readUInt16BE(head + 18);
  const capHeight = font.readInt16BE((tables.get("OS/2") ?? 0) + 88);
  expect(MARKER_CAP_BASELINE).toBe((11 * capHeight) / units / 2);
  const cmap = tables.get("cmap") ?? 0;
  let map = 0;
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const at = cmap + 4 + i * 8;
    const offset = cmap + font.readUInt32BE(at + 4);
    if (font.readUInt16BE(offset) === 4) map = offset;
  }
  expect(map).toBeGreaterThan(0);
  const segments = font.readUInt16BE(map + 6) / 2;
  function glyphFor(char: string) {
    const code = char.charCodeAt(0);
    for (let i = 0; i < segments; i++) {
      const end = font.readUInt16BE(map + 14 + i * 2);
      const start = font.readUInt16BE(map + 16 + segments * 2 + i * 2);
      if (code < start || code > end) continue;
      const delta = font.readInt16BE(map + 16 + segments * 4 + i * 2);
      const rangeAt = map + 16 + segments * 6 + i * 2;
      const range = font.readUInt16BE(rangeAt);
      return range === 0
        ? (code + delta) & 0xffff
        : (font.readUInt16BE(rangeAt + range + 2 * (code - start)) + delta) & 0xffff;
    }
    throw new Error(`Missing glyph ${char}`);
  }
  const longLoca = font.readInt16BE(head + 50) === 1;
  for (const char of "CDGNS0123456789") {
    const glyph = glyphFor(char);
    const loca = (tables.get("loca") ?? 0) + glyph * (longLoca ? 4 : 2);
    const offset = longLoca ? font.readUInt32BE(loca) : 2 * font.readUInt16BE(loca);
    const bounds = (tables.get("glyf") ?? 0) + offset;
    const xMin = font.readInt16BE(bounds + 2);
    const yMin = font.readInt16BE(bounds + 4);
    const xMax = font.readInt16BE(bounds + 6);
    const yMax = font.readInt16BE(bounds + 8);
    const advance = font.readUInt16BE((tables.get("hmtx") ?? 0) + glyph * 4);
    expect(MARKER_INK_BEARINGS[char]).toEqual([xMin, advance - xMax]);
    for (const scale of [1, 2]) {
      expect(
        Math.abs((MARKER_CAP_BASELINE - (11 * (yMin + yMax)) / units / 2) * scale),
        char,
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs((markerInkXOffset(char) + (11 * (xMin + xMax - advance)) / units / 2) * scale),
        char,
      ).toBeLessThanOrEqual(0.5);
    }
  }
});
