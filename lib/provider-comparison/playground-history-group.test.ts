import { describe, expect, it } from "vitest";
import { groupPlaygroundHistory, type PlaygroundHistorySource } from "./playground-history-group";

function source(
  overrides: Partial<PlaygroundHistorySource> & Pick<PlaygroundHistorySource, "id">,
): PlaygroundHistorySource {
  return {
    aiOverview: false,
    cents: 12,
    createdAt: "2026-11-10T10:00:00.000Z",
    device: "desktop",
    locationId: "US",
    market: "United States",
    text: "example.com rank",
    ...overrides,
  };
}

describe("SERP history grouping", () => {
  it("folds a later AI Overview into the organic check and sums the cost", () => {
    const grouped = groupPlaygroundHistory([
      source({ cents: 20, createdAt: "2026-11-10T10:00:00.000Z", id: "organic" }),
      source({
        aiOverview: true,
        cents: 5,
        createdAt: "2026-11-10T11:00:00.000Z",
        id: "overview",
      }),
    ]);
    expect(grouped).toEqual([
      expect.objectContaining({
        overviewFetched: true,
        cents: 25,
        createdAt: "2026-11-10T10:00:00.000Z",
        id: "organic",
      }),
    ]);
  });

  it("marks every search with the same exact identity, including repeated checks", () => {
    const grouped = groupPlaygroundHistory([
      source({ createdAt: "2026-11-10T09:00:00.000Z", id: "older" }),
      source({ createdAt: "2026-11-10T10:00:00.000Z", id: "newer" }),
      source({ aiOverview: true, createdAt: "2026-11-10T11:00:00.000Z", id: "overview" }),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped.find((row) => row.id === "newer")).toMatchObject({ overviewFetched: true });
    expect(grouped.find((row) => row.id === "older")).toMatchObject({ overviewFetched: true });
  });

  it("never lists an overview that has no search", () => {
    const grouped = groupPlaygroundHistory([source({ aiOverview: true, id: "only-overview" })]);
    expect(grouped).toEqual([]);
  });

  it("marks the cost unknown when any included charge is missing", () => {
    const grouped = groupPlaygroundHistory([
      source({ cents: 20, id: "organic" }),
      source({
        aiOverview: true,
        cents: null,
        createdAt: "2026-11-10T11:00:00.000Z",
        id: "overview",
      }),
    ]);
    expect(grouped[0]?.cents).toBeNull();
  });
});

it.each([
  { text: "Example.com rank" },
  { text: "example.com rank " },
  { device: "mobile" as const },
  { locationId: "DE" },
])("does not group an overview for a different search identity: %j", (change) => {
  const grouped = groupPlaygroundHistory([
    source({ id: "organic" }),
    source({ aiOverview: true, id: "overview", ...change }),
  ]);
  expect(grouped).toEqual([expect.objectContaining({ id: "organic", cents: 12 })]);
  expect(grouped[0]).not.toHaveProperty("overviewFetched");
});
