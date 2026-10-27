import { describe, expect, it } from "vitest";
import { trackedResearchForTargets } from "./tracked-research";

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  countryCode: "US",
  languageCode: "en",
  seed: "desk",
  fetchedAt: new Date("2026-10-01T00:00:00Z"),
  rows: [
    {
      keyword: "Standing Desk",
      searchVolume: 1200,
      difficulty: 22,
      cpcCents: 150,
      intent: "commercial",
      monthlyTrend: [{ year: 2026, month: 9, searchVolume: 1100 }],
    },
  ],
  ...overrides,
});
const targets = [
  { id: "us", keyword: " standing desk ", countryCode: "US", languageCode: "en" },
  { id: "es", keyword: "standing desk", countryCode: "US", languageCode: "es" },
  { id: "gb", keyword: "standing desk", countryCode: "GB", languageCode: "en" },
];

describe("tracked Research snapshots", () => {
  it("matches normalized text, country and language, choosing the newest actual returned row", () => {
    const result = trackedResearchForTargets(targets, [
      snapshot(),
      snapshot({
        fetchedAt: new Date("2026-10-02T00:00:00Z"),
        rows: [
          {
            keyword: "standing desk",
            searchVolume: 2000,
            difficulty: 30,
            cpcCents: 200,
            intent: "informational",
            monthlyTrend: [],
          },
        ],
      }),
      snapshot({ languageCode: "es", rows: [{ keyword: "different keyword", searchVolume: 999 }] }),
    ]);
    expect(result.get("us")).toMatchObject({
      volume: 2000,
      difficulty: 30,
      cpc: 2,
      intent: "informational",
      sourceSeed: "desk",
    });
    expect(result.has("es")).toBe(false);
    expect(result.has("gb")).toBe(false);
  });
  it("preserves zero, unknown and trend without inventing the searched seed as a result", () => {
    const result = trackedResearchForTargets(targets, [
      snapshot({
        rows: [
          {
            keyword: "standing desk",
            searchVolume: 0,
            difficulty: null,
            cpcCents: 0,
            intent: null,
            monthlyTrend: [{ year: 2026, month: 9, searchVolume: null }],
          },
        ],
      }),
    ]);
    expect(result.get("us")).toMatchObject({
      volume: 0,
      difficulty: null,
      cpc: 0,
      intent: null,
      trend: [{ year: 2026, month: 9, searchVolume: null }],
    });
    expect(trackedResearchForTargets(targets, [snapshot({ rows: [] })]).size).toBe(0);
  });
});
