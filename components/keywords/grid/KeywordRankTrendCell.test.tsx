import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { type ColorTokenName, colorSchemes } from "@/lib/theme/tokens";
import { stubResizeObserver } from "@/tests/observers";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { KeywordRankTrendCell } from "./KeywordRankTrendCell";
import { rankQualityRow } from "./keyword-rank-quality.test-fixture";

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("retained rank trend visibility", () => {
  it.each([null, 0, 3, -3])(
    "keeps movement %s visible on light and dark row surfaces",
    (movement) => {
      const observers = stubResizeObserver();
      const row = rankQualityRow();
      row.rankQuality.movement = movement;
      const { container } = render(<KeywordRankTrendCell row={row} formatPosition={String} />);
      act(() => {
        for (const observer of observers)
          observer.trigger([{ contentRect: { width: 92, height: 34 } } as ResizeObserverEntry]);
      });
      const stroke = container.querySelector("path.recharts-line-curve")?.getAttribute("stroke");
      expect(stroke).toBeTruthy();
      const token = stroke?.match(/^var\(--(.+)\)$/)?.[1] as ColorTokenName | undefined;
      for (const scheme of Object.values(colorSchemes)) {
        const foreground = token ? scheme[token] : (stroke as string);
        for (const surface of ["bg", "bg-elev", "bg-inset", "nav-active"] as const)
          expect(contrast(foreground, scheme[surface])).toBeGreaterThanOrEqual(3);
      }
      expect(row.sparkline).toEqual([9, 8, 6]);
    },
  );
});
