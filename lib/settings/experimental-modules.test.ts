import {
  experimentalModuleKeys,
  experimentalModulesSchema,
  hasExperimentalModule,
  normalizeExperimentalModules,
} from "@/lib/settings/experimental-modules";
import { describe, expect, it } from "vitest";

describe("experimental modules", () => {
  it("keeps only current module keys and still parses retired stored keys", () => {
    expect(experimentalModuleKeys).toEqual(["competitors"]);
    expect(
      experimentalModulesSchema.safeParse({
        enabledExperimentalModules: ["timeline", "not-a-module"],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }).success,
    ).toBe(false);
    expect(
      experimentalModulesSchema.parse({
        enabledExperimentalModules: ["timeline", "promptPlayground", "competitors"],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }).enabledExperimentalModules,
    ).toEqual(["competitors"]);
    expect(
      experimentalModulesSchema.parse({
        enabledExperimentalModules: ["timeline"],
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }).enabledExperimentalModules,
    ).toEqual([]);
  });

  it("resolves missing defaults to no enabled modules", () => {
    expect(normalizeExperimentalModules(undefined)).toEqual([]);
    expect(normalizeExperimentalModules(null)).toEqual([]);
  });

  it("ignores unknown stored values and uses normalized membership", () => {
    const enabled = normalizeExperimentalModules([
      "unknown",
      "competitors",
      "timeline",
      "promptPlayground",
    ]);

    expect(enabled).toEqual(["competitors"]);
    expect(hasExperimentalModule(enabled, "competitors")).toBe(true);
  });
});
