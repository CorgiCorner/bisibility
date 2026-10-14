import { describe, expect, it } from "vitest";
import { previewSourceHash } from "./preview-source-hash";
import type { RunSelectionKeyword } from "./selection";

const row: RunSelectionKeyword = {
  id: "keyword_1",
  text: "dentist",
  archivedAt: null,
  device: "desktop",
  locationId: "location_1",
  locationRef: {
    canonicalKey: "pl:krakow:pl",
    kind: "city",
    countryCode: "PL",
    regionCode: null,
    cityName: "Krakow",
    gl: "pl",
    hl: "pl",
    languageCode: "pl",
    primaryGeoCode: 1011455,
    primaryGeoName: "Krakow, Poland",
    secondaryGeoName: "Krakow, Poland",
  },
  checkSchedule: null,
  schedule: null,
  queuedRankCheckTasks: [],
  rankCheckRunItems: [],
  rankChecks: [],
};
const source = {
  measurementPolicy: { state: "unconfigured" as const, policyEpoch: "0", config: null },
  domain: "example.com",
  stopOnMatch: true,
  rows: [row],
  depths: [20],
  provider: {
    id: "connection_1",
    provider: "dataforseo",
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  },
};

describe("preview source binding", () => {
  it("invalidates the same IDs and quoted total when target options change", () => {
    const baseline = previewSourceHash(source);
    for (const changed of [
      { ...source, domain: "example.org" },
      { ...source, stopOnMatch: false },
      { ...source, depths: [100] },
      { ...source, rows: [{ ...row, text: "orthodontist" }] },
      { ...source, rows: [{ ...row, device: "mobile" as const }] },
      {
        ...source,
        rows: [{ ...row, locationRef: { ...row.locationRef, languageCode: "en", hl: "en" } }],
      },
      {
        ...source,
        rows: [{ ...row, locationRef: { ...row.locationRef, primaryGeoCode: 1023191 } }],
      },
      { ...source, provider: { ...source.provider, id: "connection_2" } },
      { ...source, provider: { ...source.provider, updatedAt: new Date("2026-10-02T00:00:00Z") } },
      {
        ...source,
        provider: { ...source.provider, rateContext: { entries: [], manualAmountCents: "0.01" } },
      },
    ])
      expect(previewSourceHash(changed)).not.toBe(baseline);
  });

  it("does not depend on target order and rejects depth count mismatches", () => {
    const second = { ...row, id: "keyword_2" };
    expect(previewSourceHash({ ...source, rows: [row, second], depths: [20, 100] })).toBe(
      previewSourceHash({ ...source, rows: [second, row], depths: [100, 20] }),
    );
    expect(() => previewSourceHash({ ...source, depths: [] })).toThrow("depths do not match");
  });
});
