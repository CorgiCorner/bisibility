import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

function declarations(path: string, selector: string) {
  const values = new Map<string, string>();
  postcss.parse(readFileSync(resolve(import.meta.dirname, path), "utf8")).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((declaration) => {
      values.set(declaration.prop, declaration.value);
    });
  });
  return values;
}

const secondary = declarations("Button.module.css", ".secondary");

function luminance(hex: string) {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Expected an opaque color, received ${hex}`);
  return [1, 3, 5].reduce((sum, offset, index) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe.each(["light", "dark"] as const)("secondary button in %s", (theme) => {
  const tokens = declarations("../../app/styles/theme-tokens.css", `[data-theme="${theme}"]`);
  function color(value: string): string {
    const reference = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
    return reference ? color(tokens.get(reference) ?? reference) : value;
  }

  it.each(["--bg", "--bg-elev"])("has a 3:1 boundary on %s", (surface) => {
    const border = color(secondary.get("--button-border") ?? "missing");
    const background = color(`var(${surface})`);
    for (const property of ["--button-bg", "--button-hover-bg"]) {
      const boundary =
        border === "transparent" ? color(secondary.get(property) ?? "missing") : border;
      expect(boundary).not.toBe(background);
      expect(contrast(boundary, background)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(["--button-bg", "--button-hover-bg"])(
    "keeps %s readable, filled and quieter than primary",
    (property) => {
      const fill = color(secondary.get(property) ?? "missing");
      const foreground = color(secondary.get("--button-fg") ?? "missing");
      expect(contrast(foreground, fill)).toBeGreaterThanOrEqual(4.5);
      expect(fill).not.toBe(color("var(--bg-elev)"));
      expect(contrast(fill, color("var(--bg)"))).toBeLessThan(
        contrast(color("var(--accent-solid)"), color("var(--bg)")),
      );
    },
  );
});
