import { readFileSync } from "node:fs";
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
