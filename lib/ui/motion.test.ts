import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import {
  EASE_DRAWER,
  EASE_IN_OUT,
  EASE_OUT,
  MOTION_DRAWER_ENTER,
  MOTION_DRAWER_EXIT,
  MOTION_MENU_ENTER,
  MOTION_MENU_EXIT,
  MOTION_MODAL_ENTER,
  MOTION_MODAL_EXIT,
  MOTION_PRESS,
  MOTION_TOAST_ENTER,
  MOTION_TOAST_EXIT,
  MOTION_TOOLTIP,
} from "./motion";

const tokensPath = resolve(import.meta.dirname, "../../app/styles/theme-tokens.css");

// CSS property -> expected TS value. Easing values compare as strings; durations
// compare as numbers after stripping the `ms` unit. This is the single contract
// namespace: a missing key, an extra CSS key, duration drift, or easing drift all
// fail below.
const easingContract = {
  "--ease-out": EASE_OUT,
  "--ease-in-out": EASE_IN_OUT,
  "--ease-drawer": EASE_DRAWER,
} as const;

const durationContract = {
  "--motion-press": MOTION_PRESS,
  "--motion-tooltip": MOTION_TOOLTIP,
  "--motion-menu-enter": MOTION_MENU_ENTER,
  "--motion-menu-exit": MOTION_MENU_EXIT,
  "--motion-modal-enter": MOTION_MODAL_ENTER,
  "--motion-modal-exit": MOTION_MODAL_EXIT,
  "--motion-drawer-enter": MOTION_DRAWER_ENTER,
  "--motion-drawer-exit": MOTION_DRAWER_EXIT,
  "--motion-toast-enter": MOTION_TOAST_ENTER,
  "--motion-toast-exit": MOTION_TOAST_EXIT,
} as const;

const contractProperties = new Set([
  ...Object.keys(easingContract),
  ...Object.keys(durationContract),
]);

function rootDeclarations() {
  const css = readFileSync(tokensPath, "utf8");
  const parsed = postcss.parse(css);
  const values: Record<string, string> = {};
  parsed.walkRules((rule) => {
    if (!rule.selector.includes(":root")) return;
    rule.walkDecls((decl) => {
      values[decl.prop] = decl.value;
    });
  });
  return values;
}

describe("motion tokens", () => {
  it("keeps every CSS motion/easing value synchronized with lib/ui/motion.ts", () => {
    const css = rootDeclarations();

    for (const [prop, expected] of Object.entries(easingContract)) {
      expect(css[prop], `missing CSS declaration ${prop}`).toBe(expected);
    }

    for (const [prop, expected] of Object.entries(durationContract)) {
      const raw = css[prop];
      expect(raw, `missing CSS declaration ${prop}`).toBeDefined();
      expect(raw.endsWith("ms"), `${prop} must be an ms duration`).toBe(true);
      expect(Number(raw.slice(0, -2)), `${prop} duration drift`).toBe(expected);
    }
  });

  it("does not introduce a CSS motion/easing key absent from the TS contract", () => {
    const css = rootDeclarations();
    const extra = Object.keys(css).filter(
      (prop) =>
        (prop.startsWith("--motion-") || prop.startsWith("--ease-")) &&
        !contractProperties.has(prop),
    );
    expect(extra, "extra CSS keys not mirrored in motion.ts").toEqual([]);
  });

  it("exports only numeric millisecond durations for the duration namespace", () => {
    for (const value of Object.values(durationContract)) {
      expect(typeof value).toBe("number");
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });
});
