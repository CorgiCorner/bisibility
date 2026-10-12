import { ImportStepper } from "@/components/keywords/import/ImportCsvWizardSteps";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { type ColorTokenName, colorSchemes } from "@/lib/theme/tokens";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pill } from "./Pill";

type Rgb = number[];
function rgb(hex: string): Rgb {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}
function ratio(a: Rgb, b: Rgb) {
  const luminance = (value: Rgb) =>
    value.reduce((sum, channel, index) => {
      const c = channel / 255;
      return (
        sum +
        (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]
      );
    }, 0);
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
function resolve(scheme: keyof typeof colorSchemes, expression: string): Rgb {
  const tokens = [...expression.matchAll(/var\(--([a-z-]+)\)/g)].map((m) =>
    rgb(colorSchemes[scheme][m[1] as ColorTokenName]),
  );
  if (expression.startsWith("color-mix")) {
    const amount = Number(expression.match(/(\d+)%/)?.[1]) / 100;
    return tokens[0].map((channel, index) => channel * amount + tokens[1][index] * (1 - amount));
  }
  return tokens[0] ?? rgb(expression);
}

describe("enabled small control contrast", () => {
  it.each([true, false])(
    "keeps pill resting, hover and keyboard text readable with active=%s",
    (active) => {
      render(<Pill active={active}>Position: Top 3</Pill>);
      const pill = screen.getByRole("button", { name: "Position: Top 3" });
      const value = (key: string) => pill.style.getPropertyValue(`--control-${key}`);
      for (const scheme of ["light", "dark"] as const) {
        for (const state of ["", "hover-"] as const) {
          expect(
            ratio(
              resolve(scheme, value(`${state}color`)),
              resolve(scheme, value(`${state}background-color`)),
            ),
          ).toBeGreaterThanOrEqual(4.5);
        }
        // Button focus falls back to the resting pair and its shared solid outline.
        expect(
          ratio(resolve(scheme, value("color")), resolve(scheme, value("background-color"))),
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
  it.each([1, 2, 3, 4, 5])(
    "keeps import step %s numerals and completed glyphs readable in both themes",
    (step) => {
      const { container } = render(<ImportStepper step={step} />);
      const markers = container.querySelectorAll<HTMLElement>("span.rounded-full.grid");
      expect(markers).toHaveLength(5);
      for (const marker of markers) {
        // The current step uses the operator-approved primary pair (brand --accent-solid with the
        // cream --accent-on-solid label, 3.25:1 by design, see lib/theme/tokens.ts); every other
        // marker must meet text AA.
        const primaryPair =
          marker.style.backgroundColor === "var(--accent-solid)" &&
          marker.style.color === "var(--accent-on-solid)";
        for (const scheme of ["light", "dark"] as const) {
          expect(
            ratio(
              resolve(scheme, marker.style.color),
              resolve(scheme, marker.style.backgroundColor),
            ),
          ).toBeGreaterThanOrEqual(primaryPair ? 3 : 4.5);
        }
      }
    },
  );
});
