import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { DEFAULT_LENS_DEVICE } from "@/lib/keywords/lens-model";
import {
  parseRankTrackerQuery,
  resolveRankTrackerQuery,
  serializeRankTrackerQuery,
} from "@/lib/keywords/rank-tracker-query";
import { emptySavedViewConfig } from "@/lib/keywords/saved-view-model";
import { describe, expect, test } from "vitest";

describe("rank tracker URL query contract", () => {
  test("uses deterministic defaults", () => {
    const parsed = parseRankTrackerQuery({});
    expect(parsed.state).toEqual({
      filters: emptyKeywordFilters,
      grouped: false,
      lens: { device: DEFAULT_LENS_DEVICE, locationId: null },
      page: 1,
      pageSize: 50,
      savedViewId: null,
      search: "",
      sort: { direction: "asc", field: "position" },
    });
    expect(parsed.present.size).toBe(0);
    expect(serializeRankTrackerQuery(parsed.state).toString()).toBe("");
  });

  test("trims, deduplicates, and accepts repeated and comma-delimited lists", () => {
    const parsed = parseRankTrackerQuery({
      intents: [" commercial,informational ", "commercial"],
      position: ["top3, nope", "top10", "top3"],
      serp: "paa,featured,paa,invalid",
      tags: [" Priority,Brand ", "Priority"],
      topics: " Shoes, Boots, Shoes ",
    });
    expect(parsed.state.filters).toMatchObject({
      intents: ["commercial", "informational"],
      position: ["top3", "top10"],
      serp: ["paa", "featured"],
      tags: ["Priority", "Brand"],
      topics: ["Shoes", "Boots"],
    });
  });

  test("bounds strings, arrays, numbers, pagination, and invalid enums safely", () => {
    const many = Array.from({ length: 25 }, (_, index) => `tag-${index}`);
    const parsed = parseRankTrackerQuery({
      change: "sideways",
      contains: "x".repeat(81),
      device: "tablet",
      page: "999999",
      pageSize: "10",
      q: "q".repeat(121),
      tags: many,
      volMax: "-1",
      volMin: "NaN",
    });
    expect(parsed.state.search).toBe("");
    expect(parsed.state.filters.contains).toBe("");
    expect(parsed.state.filters.tags).toEqual([]);
    expect(parsed.state.filters.change).toBe("any");
    expect(parsed.state.filters.volMin).toBe(0);
    expect(parsed.state.filters.volMax).toBe(50);
    expect(parsed.state.lens.device).toBe(DEFAULT_LENS_DEVICE);
    expect(parsed.state.page).toBe(1);
    expect(parsed.state.pageSize).toBe(50);
    expect(parsed.issues).toEqual(
      expect.arrayContaining(["change", "contains", "device", "page", "pageSize", "q", "tags"]),
    );
  });

  test.each([25, 50, 100] as const)("preserves valid pageSize=%i deep links", (pageSize) => {
    const parsed = parseRankTrackerQuery({ pageSize: String(pageSize) });
    expect(parsed.state.pageSize).toBe(pageSize);
    expect(parsed.present).toContain("pageSize");
    const canonical = serializeRankTrackerQuery(parsed).toString();
    expect(canonical).toBe(`pageSize=${pageSize}`);
    expect(
      parseRankTrackerQuery(Object.fromEntries(new URLSearchParams(canonical))).state.pageSize,
    ).toBe(pageSize);
  });

  test.each([
    ["1", true],
    ["true", true],
    ["yes", true],
    ["on", true],
    ["0", false],
    ["false", false],
    ["no", false],
    ["off", false],
  ])("parses boolean %s", (raw, expected) => {
    expect(parseRankTrackerQuery({ grouped: raw }).state.grouped).toBe(expected);
  });

  test("serializes canonically and round trips deterministically", () => {
    const first = parseRankTrackerQuery({
      change: "down",
      contains: "  sale ",
      device: "mobile",
      dir: "desc",
      grouped: "true",
      intents: ["buy,learn", "buy"],
      lastCheck: "not_checked",
      location: " loc-1 ",
      page: "3",
      pageSize: "50",
      position: "top10,top3",
      q: " boots ",
      serp: "video,paa",
      sort: "volume",
      tags: "B,A",
      topics: "Winter",
      urlChanged: "yes",
      view: " view-1 ",
      volMax: "40",
      volMin: "5",
      wrongUrl: "1",
    });
    const canonical = serializeRankTrackerQuery(first).toString();
    expect(canonical).toBe(
      "q=boots&location=loc-1&device=mobile&position=top10%2Ctop3&change=down&volMin=5&volMax=40&contains=sale&tags=B%2CA&topics=Winter&intents=buy%2Clearn&serp=video%2Cpaa&lastCheck=not_checked&wrongUrl=1&urlChanged=1&sort=volume&dir=desc&page=3&pageSize=50&grouped=1&view=view-1",
    );
    expect(
      serializeRankTrackerQuery(
        parseRankTrackerQuery(Object.fromEntries(new URLSearchParams(canonical))),
      ).toString(),
    ).toBe(canonical);
  });

  test("inherits saved view fields not present in the URL", () => {
    const saved = {
      ...emptySavedViewConfig,
      filters: { ...emptyKeywordFilters, change: "up" as const, tags: ["Saved"] },
      lens: { device: "mobile" as const, locationId: "saved-location" },
      search: "saved search",
    };
    const resolved = resolveRankTrackerQuery(parseRankTrackerQuery({ view: "saved-id" }), saved);
    expect(resolved.search).toBe("saved search");
    expect(resolved.filters.change).toBe("up");
    expect(resolved.filters.tags).toEqual(["Saved"]);
    expect(resolved.lens).toEqual(saved.lens);
    expect(resolved.pageSize).toBe(50);
  });

  test("URL values override saved view values and can explicitly clear fields", () => {
    const saved = {
      ...emptySavedViewConfig,
      filters: {
        ...emptyKeywordFilters,
        contains: "saved",
        serp: ["paa"],
        tags: ["Saved"],
        wrongUrl: true,
      },
      lens: { device: "mobile" as const, locationId: "saved-location" },
      search: "saved search",
    };
    const parsed = parseRankTrackerQuery({
      contains: "",
      device: "desktop",
      location: "",
      q: "",
      serp: "",
      tags: "",
      wrongUrl: "0",
    });
    const resolved = resolveRankTrackerQuery(parsed, saved);
    expect(resolved.search).toBe("");
    expect(resolved.filters.contains).toBe("");
    expect(resolved.filters.serp).toEqual([]);
    expect(resolved.filters.tags).toEqual([]);
    expect(resolved.filters.wrongUrl).toBe(false);
    expect(resolved.lens).toEqual({ device: "desktop", locationId: null });
    const canonical = serializeRankTrackerQuery(parsed).toString();
    expect(canonical).toBe("q=&location=&device=desktop&contains=&tags=&serp=&wrongUrl=0");
    expect(
      resolveRankTrackerQuery(
        parseRankTrackerQuery(Object.fromEntries(new URLSearchParams(canonical))),
        saved,
      ),
    ).toEqual(resolved);
  });
  test("preserves literal any in contains through state-only serialization", () => {
    const parsed = parseRankTrackerQuery({ contains: "any" });
    const canonical = serializeRankTrackerQuery(parsed.state).toString();
    expect(canonical).toBe("contains=any");

    const reparsed = parseRankTrackerQuery(Object.fromEntries(new URLSearchParams(canonical)));
    expect(reparsed.state.filters.contains).toBe("any");

    const saved = {
      ...emptySavedViewConfig,
      filters: { ...emptyKeywordFilters, contains: "saved value" },
    };
    expect(resolveRankTrackerQuery(reparsed, saved).filters.contains).toBe("any");
  });

  test("preserves enum any overrides for saved views through state-only serialization", () => {
    const parsed = parseRankTrackerQuery({ change: "any", view: "saved-id" });
    const canonical = serializeRankTrackerQuery(parsed.state).toString();
    expect(canonical).toBe("change=any&lastCheck=any&view=saved-id");

    const reparsed = parseRankTrackerQuery(Object.fromEntries(new URLSearchParams(canonical)));
    const saved = {
      ...emptySavedViewConfig,
      filters: { ...emptyKeywordFilters, change: "up" as const },
    };
    expect(resolveRankTrackerQuery(reparsed, saved).filters.change).toBe("any");
  });
});
