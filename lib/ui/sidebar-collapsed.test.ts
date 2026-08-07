import { describe, expect, it } from "vitest";
import { isSidebarCollapsed } from "./sidebar-collapsed";

describe("isSidebarCollapsed", () => {
  it.each([
    ["an absent value", undefined, false],
    ['the "true" value', "true", true],
    ['the "false" value', "false", false],
  ])("returns %s for %s", (_scenario, value, expected) => {
    expect(isSidebarCollapsed(value)).toBe(expected);
  });
});
