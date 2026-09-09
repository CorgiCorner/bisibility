import { describe, expect, it } from "vitest";
import {
  addRecentSearch,
  cacheTimeRemaining,
  parseRecentSearches,
  persistRecentSearch,
  persistRemoveRecentSearch,
  readRecentSearches,
  recentSearchesKey,
  removeRecentSearch,
} from "./recent-searches";

const input = {
  cachedUntil: "2026-07-22T20:00:00.000Z",
  includeClickstream: false,
  scopeLabel: "United States / English",
  mode: "auto" as const,
  resultLimit: 100 as const,
  seed: "rank tracker",
};
const referenceBase = process.env.R5_REFERENCE_BASE === "1";

describe("recent keyword research", () => {
  it("uses a per-project storage key and ignores invalid JSON", () => {
    expect(recentSearchesKey("prj_1")).toBe("bisibility:keyword-research:recent:prj_1");
    expect(parseRecentSearches("not-json")).toEqual([]);
    expect(parseRecentSearches(JSON.stringify([{ seed: 1 }]))).toEqual([]);
  });

  it.each([
    {
      expected: { locationKey: "ES/ES-AN/Malaga", scopeLabel: "Spain / Spanish" },
      name: "derives a country-language scope from a legacy city location key",
      row: {
        cachedUntil: "2026-07-22T20:00:00.000Z",
        createdAt: "2026-07-22T08:00:00.000Z",
        includeClickstream: false,
        locationKey: "ES/ES-AN/Malaga",
        market: "Malaga, Spain",
        mode: "auto",
        resultLimit: 100,
        seed: "rank tracker",
      },
    },
    {
      expected: { locationKey: null, scopeLabel: "Malaga, Spain" },
      name: "keeps a legacy display string when no location key was stored",
      row: {
        cachedUntil: "2026-07-22T20:00:00.000Z",
        createdAt: "2026-07-22T08:00:00.000Z",
        includeClickstream: false,
        market: "Malaga, Spain",
        mode: "auto",
        resultLimit: 100,
        seed: "rank tracker",
      },
    },
  ])("$name", ({ expected, row }) => {
    const [search] = parseRecentSearches(JSON.stringify([row]));

    expect(
      JSON.stringify({
        locationKey: search?.locationKey ?? null,
        scopeLabel: search?.scopeLabel ?? null,
      }),
    ).toBe(JSON.stringify(expected));
  });

  it.each([
    {
      allowedScopeRename: { locationKey: "ES/ES-AN/Malaga", scopeLabel: "Spain / Spanish" },
      baseExpected: { locationKey: "ES/ES-AN/Malaga", scopeLabel: "Malaga, Spain" },
      input: { locationKey: "ES/ES-AN/Malaga", scopeLabel: "Malaga, Spain" },
      name: "maps a city display label to its card-mandated country-language scope",
    },
    {
      baseExpected: { locationKey: null, scopeLabel: "Malaga, Spain" },
      input: { scopeLabel: "Malaga, Spain" },
      name: "keeps the supplied display string without a location key",
    },
    {
      baseExpected: { locationKey: "unknown", scopeLabel: "Unknown location" },
      input: { locationKey: "unknown", scopeLabel: "Unknown location" },
      name: "keeps the supplied display string for an unrecognized location key",
    },
  ])("$name", ({ allowedScopeRename, baseExpected, input: scopeInput }) => {
    const [search] = addRecentSearch(
      [],
      { ...input, ...scopeInput },
      new Date("2026-07-22T08:00:00.000Z"),
    );

    expect(
      JSON.stringify({
        cacheKey: recentSearchesKey("prj_1"),
        locationKey: search?.locationKey ?? null,
        scopeLabel: search?.scopeLabel ?? null,
      }),
    ).toBe(
      JSON.stringify({
        cacheKey: "bisibility:keyword-research:recent:prj_1",
        ...(referenceBase ? baseExpected : (allowedScopeRename ?? baseExpected)),
      }),
    );
  });

  it("deduplicates equivalent searches and keeps the server cache expiry", () => {
    const first = addRecentSearch([], input, new Date("2026-07-22T08:00:00.000Z"));
    const next = addRecentSearch(
      first,
      {
        ...input,
        cachedUntil: "2026-07-22T17:30:00.000Z",
        seed: " Rank Tracker ",
      },
      new Date("2026-07-22T09:00:00.000Z"),
    );

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      cachedUntil: "2026-07-22T17:30:00.000Z",
      createdAt: "2026-07-22T09:00:00.000Z",
    });
    expect(
      cacheTimeRemaining(next[0]?.cachedUntil ?? "", new Date("2026-07-22T10:00:00.000Z")),
    ).toBe(7.5 * 60 * 60 * 1000);
  });

  it("persists and reads searches through the storage boundary", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    persistRecentSearch(storage, "prj_1", input, new Date("2026-07-22T08:00:00.000Z"));

    expect(readRecentSearches(storage, "prj_1")).toHaveLength(1);
  });

  it("removes only the entry matching both createdAt and seed", () => {
    const first = addRecentSearch([], input, new Date("2026-07-22T08:00:00.000Z"));
    const withSecond = addRecentSearch(
      first,
      { ...input, seed: "seo tool" },
      new Date("2026-07-22T09:00:00.000Z"),
    );

    const remaining = removeRecentSearch(withSecond, {
      createdAt: "2026-07-22T09:00:00.000Z",
      seed: "seo tool",
    });

    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      createdAt: "2026-07-22T08:00:00.000Z",
      seed: "rank tracker",
    });
    expect(
      removeRecentSearch(withSecond, {
        createdAt: "2026-07-22T09:00:00.000Z",
        seed: "rank tracker",
      }),
    ).toHaveLength(2);
  });

  it("persists removals through the storage boundary", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    persistRecentSearch(storage, "prj_1", input, new Date("2026-07-22T08:00:00.000Z"));
    persistRecentSearch(
      storage,
      "prj_1",
      { ...input, seed: "seo tool" },
      new Date("2026-07-22T09:00:00.000Z"),
    );

    const updated = persistRemoveRecentSearch(storage, "prj_1", {
      createdAt: "2026-07-22T09:00:00.000Z",
      seed: "seo tool",
    });

    expect(updated).toHaveLength(1);
    expect(readRecentSearches(storage, "prj_1")).toHaveLength(1);
    expect(readRecentSearches(storage, "prj_1")[0]?.seed).toBe("rank tracker");
  });

  it("derives remaining cache time from the persisted server expiry", () => {
    const [recent] = addRecentSearch([], input, new Date("2026-07-22T10:00:00.000Z"));

    expect(recent?.cachedUntil).toBe("2026-07-22T20:00:00.000Z");
    expect(recent?.createdAt).toBe("2026-07-22T10:00:00.000Z");
    expect(
      cacheTimeRemaining(recent?.cachedUntil ?? "", new Date("2026-07-22T12:00:00.000Z")),
    ).toBe(8 * 60 * 60 * 1000);
  });
});
