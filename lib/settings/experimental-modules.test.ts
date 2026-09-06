import {
  experimentalModuleKeys,
  experimentalModulesSchema,
  hasExperimentalModule,
  normalizeExperimentalModules,
} from "@/lib/settings/experimental-modules";
import { describe, expect, it } from "vitest";

describe("experimental modules", () => {
  it("defines only Timeline and Competitors as valid keys", () => {
    expect(experimentalModuleKeys).toEqual(["timeline", "competitors"]);
    expect(
      experimentalModulesSchema.safeParse({
        enabledExperimentalModules: ["timeline", "not-a-module"],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }).success,
    ).toBe(false);
  });

  it("resolves missing defaults to no enabled modules", () => {
    expect(normalizeExperimentalModules(undefined)).toEqual([]);
    expect(normalizeExperimentalModules(null)).toEqual([]);
  });

  it("ignores unknown stored values and uses normalized membership", () => {
    const enabled = normalizeExperimentalModules(["unknown", "competitors", "timeline"]);

    expect(enabled).toEqual(["timeline", "competitors"]);
    expect(hasExperimentalModule(enabled, "timeline")).toBe(true);
    expect(hasExperimentalModule(enabled, "competitors")).toBe(true);
  });
});
