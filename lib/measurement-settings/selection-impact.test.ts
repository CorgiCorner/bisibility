import { describe, expect, it } from "vitest";
import { measurementSelectionSources, measurementSettingsImpact } from "./selection-impact";
import type { SettingsSnapshot } from "./ui-contracts";

const baseline: SettingsSnapshot = {
  revision: 4,
  sourceHash: "a".repeat(64),
  scheduleId: null,
  defaultIntent: { geoId: "US", languageCode: "en", device: "desktop", depth: 20 },
  selection: {
    geoId: "US",
    languageCode: "en",
    device: "desktop",
    depth: 50,
    providerId: "provider",
    capabilityVersion: "version",
    surface: "web_serp",
  },
  schedule: null,
  scopeSources: {
    geo: "project",
    language: "project",
    device: "project",
    depth: "schedule",
    provider: "schedule",
    surface: "unknown",
  },
};
describe("current settings origin and comparison impact", () => {
  it("retains actual project/schedule baseline origin and marks only changed fields explicit", () => {
    expect(measurementSelectionSources(baseline, baseline.selection)).toEqual(
      baseline.scopeSources,
    );
    expect(
      measurementSelectionSources(baseline, {
        ...baseline.selection,
        device: "mobile",
        depth: 100,
      }),
    ).toMatchObject({
      geo: "project",
      device: "explicit",
      depth: "explicit",
      provider: "schedule",
    });
  });
  it.each([
    { device: "mobile" as const },
    { geoId: "PL" },
    { languageCode: "pl" },
    { surface: "maps" as const },
  ])("requires retained definition proof for a changed scope, case %#", (change) => {
    expect(
      measurementSettingsImpact(baseline, {
        selection: { ...baseline.selection, ...change },
        schedule: null,
      }),
    ).toEqual({ kind: "scope_changed", historicalComparison: "definition_proof_required" });
  });
  it.each([{ depth: 100 }, { providerId: "other" }, { capabilityVersion: "next" }])(
    "does not invent compatibility for material policy, case %#",
    (change) => {
      expect(
        measurementSettingsImpact(baseline, {
          selection: { ...baseline.selection, ...change },
          schedule: null,
        }),
      ).toEqual({ kind: "policy_changed", historicalComparison: "definition_proof_required" });
    },
  );
  it("distinguishes cadence-only from scope change without qualifying any historical record", () => {
    expect(
      measurementSettingsImpact(baseline, {
        selection: baseline.selection,
        schedule: {
          enabled: true,
          frequency: "daily",
          timezone: "Europe/Warsaw",
          timeOfDay: "06:00",
          weekday: null,
          dayOfMonth: null,
          cronExpression: "",
          jitterMinutes: 0,
        },
      }),
    ).toEqual({ kind: "cadence_only", historicalComparison: "scope_preserved" });
  });
});
