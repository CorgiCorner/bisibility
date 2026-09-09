import { describe, expect, it } from "vitest";
import { dataForSeoObservationRun } from "./observation-extract-dataforseo";

const executedAt = new Date("2026-08-28T12:00:00.000Z");
const input = {
  completeness: "complete" as const,
  configuredScope: { device: "desktop", language: "en", location: "United States" },
  executedAt,
  requestPolicy: {
    depth: 100,
    findTargetsIn: null,
    forcedAiOverview: false as const,
    stopOnMatch: false,
  },
};

describe("dataForSeoObservationRun", () => {
  it("groups consecutive flat local-pack entries without changing opaque CIDs", () => {
    const first = {
      cid: "18446744073709551615",
      domain: "www.example.com",
      rank_absolute: 3,
      rank_group: 1,
      rating: { value: 4.6, votes_count: 1203 },
      title: "First business",
      type: "local_pack",
      url: "https://www.example.com/first",
    };
    const second = {
      domain: "second.example.com",
      rank_absolute: 3,
      rank_group: 2,
      title: "Second business",
      type: "local_pack",
      url: "https://second.example.com",
    };
    const third = {
      domain: "third.example.com",
      rank_absolute: 3,
      rank_group: 3,
      title: "Third business",
      type: "local_pack",
      url: "https://third.example.com",
    };

    const run = dataForSeoObservationRun({
      ...input,
      items: [{ type: "organic" }, first, second, third, { type: "organic" }],
    });

    expect(run.items).toHaveLength(3);
    expect(run.items.map((item) => item.blockPosition)).toEqual([3, 3, 3]);
    expect(run.items.map((item) => item.positionInBlock)).toEqual([1, 2, 3]);
    expect(run.items.map((item) => item.businessName)).toEqual([
      "First business",
      "Second business",
      "Third business",
    ]);
    expect(run.items[0]).toMatchObject({
      cid: "18446744073709551615",
      rating: { count: 1203, value: 4.6 },
    });
    expect(run.items[0]?.rawFragment).toBe(first);
  });

  it("uses nested local-pack elements as durable fragments", () => {
    const first = {
      rank_absolute: 1,
      rank_group: 1,
      title: "Alpha",
      url_maps: " https://maps.example.com/a ",
    };
    const second = {
      rank_absolute: 2,
      rank_group: 2,
      title: "Beta",
      maps_url: "https://maps.example.com/b",
    };
    const container = { items: [first, second], rank_absolute: 4, type: "local_pack" };

    const run = dataForSeoObservationRun({ ...input, items: [container] });

    expect(run.items).toHaveLength(2);
    expect(run.items.map((item) => item.blockPosition)).toEqual([4, 4]);
    expect(run.items.map((item) => item.positionInBlock)).toEqual([1, 2]);
    expect(run.items[0]?.rawFragment).toBe(first);
    expect(run.items[1]?.rawFragment).toBe(second);
    expect(run.items.map((item) => item.mapsUrl)).toEqual([
      "https://maps.example.com/a",
      "https://maps.example.com/b",
    ]);
  });

  it("keeps a flat local-pack block position null without provider rank data", () => {
    const run = dataForSeoObservationRun({
      ...input,
      items: [
        { title: "First", type: "local_pack" },
        { title: "Second", type: "local_pack" },
        { title: "Third", type: "local_pack" },
      ],
    });

    expect(run.items.map((item) => item.blockPosition)).toEqual([null, null, null]);
    expect(run.items.map((item) => item.positionInBlock)).toEqual([1, 2, 3]);
  });

  it("prefers provider rank-group values within a flat local-pack block", () => {
    const run = dataForSeoObservationRun({
      ...input,
      items: [
        { rank_group: 2, title: "First", type: "local_pack" },
        { rank_group: 4, title: "Second", type: "local_pack" },
      ],
    });

    expect(run.items.map((item) => item.positionInBlock)).toEqual([2, 4]);
  });

  it("stores one AI overview block and keeps its whole provider fragment", () => {
    const overview = {
      items: [{ text: "" }, { text: "Summary title" }],
      rank_absolute: 2,
      rank_group: 1,
      type: "ai_overview",
    };

    const run = dataForSeoObservationRun({ ...input, items: [overview] });

    expect(run.items).toEqual([
      expect.objectContaining({
        blockPosition: 2,
        positionInBlock: 1,
        rankAbsolute: 2,
        resultKind: "ai_overview",
        title: "Summary title",
      }),
    ]);
    expect(run.items[0]?.rawFragment).toBe(overview);
  });

  it("keeps an AI overview block position null without rank_absolute", () => {
    const run = dataForSeoObservationRun({
      ...input,
      items: [{ items: [{ text: "Summary title" }], type: "ai_overview" }],
    });

    expect(run.items[0]).toMatchObject({ blockPosition: null, positionInBlock: 1 });
  });

  it("returns an empty complete run for a page that only has organic results", () => {
    const run = dataForSeoObservationRun({
      ...input,
      items: [{ type: "organic" }, { title: "Organic", type: "organic" }],
    });

    expect(run).toMatchObject({ completeness: "complete", items: [], provider: "dataforseo" });
  });

  it("ignores garbage entries without throwing", () => {
    expect(() =>
      dataForSeoObservationRun({
        ...input,
        items: [null, "not an item", { title: "Missing type" }, { type: "organic" }],
      }),
    ).not.toThrow();
    expect(
      dataForSeoObservationRun({
        ...input,
        items: [null, "not an item", { title: "Missing type" }],
      }).items,
    ).toEqual([]);
  });

  it("returns only the observation contract keys, never the provider payload", () => {
    const run = dataForSeoObservationRun({
      ...input,
      items: [{ type: "organic" }],
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
