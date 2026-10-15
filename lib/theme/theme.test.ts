import { readFileSync } from "node:fs";
import { colorSchemes } from "@/lib/theme/tokens";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { describe, expect, it } from "vitest";

describe("CSS theme contract", () => {
  it("keeps native control radii aligned with the shared design tokens", () => {
    const css = readFileSync("app/styles/theme-tokens.css", "utf8");
    for (const [role, value] of Object.entries(UI_RADIUS_ROLES)) {
      expect(css).toContain(`--radius-${role}: ${value};`);
    }
  });
});

it.each(["light", "dark"] as const)(
  "keeps %s border colors aligned with the shared tokens",
  (scheme) => {
    const css = readFileSync("app/styles/theme-tokens.css", "utf8");
    const block = css.match(new RegExp(`\\[data-theme="${scheme}"\\]\\s*\\{([^}]+)\\}`))?.[1];
    expect(block).toBeDefined();
    for (const token of ["border", "border-soft", "border-control"] as const) {
      expect(block?.toLowerCase()).toContain(
        `--${token}: ${colorSchemes[scheme][token].toLowerCase()};`,
      );
    }
  },
);
