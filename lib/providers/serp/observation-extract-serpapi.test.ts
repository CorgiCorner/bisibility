import { describe, expect, it } from "vitest";
import { serpApiObservationRun } from "./observation-extract-serpapi";

const executedAt = new Date("2026-08-28T12:00:00.000Z");
const input = {
  completeness: "complete" as const,
  configuredScope: { device: "desktop", language: "en", location: "United States" },
  executedAt,
  requestPolicy: {
    depth: 10,
    findTargetsIn: null,
    forcedAiOverview: false as const,
    stopOnMatch: false,
  },
};

describe("serpApiObservationRun", () => {
  it("deduplicates local results by place ID and extracts durable local data", () => {
    const first = {
      data_cid: "18446744073709551615",
      links: {
        directions: "https://maps.example.com/first",
        website: "https://www.example.com/first",
      },
      place_id: "place-first",
      position: 3,
      rating: 4.7,
      reviews: 88,
      title: "First local business",
    };
    const duplicate = { place_id: "place-first", title: "Duplicate" };
    const second = { place_id: "place-second", title: "Second local business" };
    const third = {
      place_id: "place-third",
      place_id_search: "https://api.example.org/places/place-third",
      title: "Third local business",
    };

    const run = serpApiObservationRun({
      ...input,
      pages: [{ local_results: { places: [first, duplicate, second] }, places_results: [third] }],
    });

    expect(run.items).toHaveLength(3);
    expect(run.items[0]).toMatchObject({
      blockPosition: null,
      cid: "18446744073709551615",
      domain: "www.example.com",
      mapsUrl: "https://maps.example.com/first",
      positionInBlock: 1,
      rating: { count: 88, value: 4.7 },
    });
    expect(run.items.map((item) => item.businessName)).toEqual([
      "First local business",
      "Second local business",
      "Third local business",
    ]);
    expect(run.items.map((item) => item.positionInBlock)).toEqual([1, 2, 1]);
    expect(run.items[2]?.mapsUrl).toBeNull();
    expect(run.items[0]?.rawFragment).toBe(first);
  });

  it("accepts local_results as a bare array", () => {
    const place = { place_id: "place-array", position: 2, title: "Array business" };
    const run = serpApiObservationRun({ ...input, pages: [{ local_results: [place] }] });

    expect(run.items).toEqual([
      expect.objectContaining({
        placeId: "place-array",
        positionInBlock: 1,
        title: "Array business",
      }),
    ]);
    expect(run.items[0]?.rawFragment).toBe(place);
  });

  it("stores one AI overview with the first text-block snippet", () => {
    const overview = {
      text_blocks: [
        { snippet: "First overview snippet", title: "Later title" },
        { snippet: "Later" },
      ],
    };
    const run = serpApiObservationRun({ ...input, pages: [{ ai_overview: overview }] });

    expect(run.items).toEqual([
      expect.objectContaining({
        positionInBlock: 1,
        resultKind: "ai_overview",
        title: "First overview snippet",
      }),
    ]);
    expect(run.items[0]?.rawFragment).toBe(overview);
  });

  it("preserves local and AI observations in page order", () => {
    const run = serpApiObservationRun({
      ...input,
      pages: [
        { local_results: [{ place_id: "one", title: "First page local" }] },
        {
          ai_overview: { text_blocks: [{ title: "Second page AI" }] },
          local_results: [{ place_id: "two", title: "Second page local" }],
        },
      ],
    });

    expect(run.items.map((item) => item.title)).toEqual([
      "First page local",
      "Second page local",
      "Second page AI",
    ]);
  });

  it("returns only the observation contract keys, never the provider payload", () => {
    const run = serpApiObservationRun({
      ...input,
      pages: [{ organic_results: [] }],
    });

    expect(Object.keys(run).sort()).toEqual([
      "completeness",
      "configuredScope",
      "effectiveScope",
      "engine",
      "executedAt",
      "items",
      "provider",
      "requestPolicy",
      "surface",
    ]);
    expect(run.effectiveScope).toBeNull();
  });
});
