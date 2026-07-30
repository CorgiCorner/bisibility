import { describe, expect, it } from "vitest";
import type { CityCandidate, LocationStore, ResolvedLocation } from "./location";
import { resolveLocation } from "./location-resolver";

function fakeStore() {
  const rows = new Map<string, ResolvedLocation>();
  const creates: string[] = [];
  let seq = 0;
  const store: LocationStore = {
    async findByKey(key) {
      return rows.get(key) ?? null;
    },
    async create(row) {
      creates.push(row.canonicalKey);
      seq += 1;
      const created: ResolvedLocation = { ...row, id: `loc_${seq}` };
      rows.set(row.canonicalKey, created);
      return created;
    },
  };
  return { store, rows, creates };
}

const austin: CityCandidate = {
  displayName: "Austin, Texas, United States",
  regionCode: "US-TX",
  cityName: "Austin",
  primaryGeoCode: 1026201,
  primaryGeoName: "Austin,Texas,United States",
  secondaryGeoName: "Austin, Texas, United States",
};
const cityLookup = { findCity: async () => austin };
const missLookup = { findCity: async () => null };

describe("resolveLocation", () => {
  it("resolves a country deterministically and caches it", async () => {
    const { store, creates } = fakeStore();
    const first = await resolveLocation({ countryCode: "US" }, { store });
    expect(first).toMatchObject({ degraded: false, warning: null });
    expect(first.location).toMatchObject({
      kind: "country",
      countryCode: "US",
      gl: "us",
      hl: "en",
      primaryGeoCode: null,
      canonicalKey: "US",
    });

    const second = await resolveLocation({ countryCode: "us" }, { store });
    expect(second.location.id).toBe(first.location.id);
    expect(creates).toEqual(["US"]); // created once, second hit the cache
  });

  it("resolves a city through the provider lookup and caches by key", async () => {
    const { store, creates } = fakeStore();
    const res = await resolveLocation(
      { countryCode: "US", cityName: "Austin" },
      {
        store,
        lookup: cityLookup,
      },
    );
    expect(res).toMatchObject({ degraded: false, warning: null });
    expect(res.location).toMatchObject({
      kind: "city",
      cityName: "Austin",
      regionCode: "US-TX",
      gl: "us",
      hl: "en",
      primaryGeoCode: 1026201,
      canonicalKey: "US/US-TX/Austin",
    });

    const again = await resolveLocation(
      { countryCode: "US", cityName: "Austin" },
      {
        store,
        lookup: cityLookup,
      },
    );
    expect(again.location.id).toBe(res.location.id);
    expect(creates).toEqual(["US/US-TX/Austin"]);
  });

  it("keeps same-named provider cities distinct when only region labels are known", async () => {
    const { store, creates } = fakeStore();
    const labelLookup = {
      findCity: async (input: { regionName?: string | null }) => ({
        cityName: "Austin",
        displayName: `Austin,${input.regionName},United States`,
        primaryGeoCode: input.regionName === "Texas" ? 1026201 : 1026202,
        primaryGeoName: `Austin,${input.regionName},United States`,
        regionCode: null,
        regionName: input.regionName,
        secondaryGeoName: `Austin,${input.regionName},United States`,
      }),
    };

    const texas = await resolveLocation(
      { cityName: "Austin", countryCode: "US", regionName: "Texas" },
      { lookup: labelLookup, store },
    );
    const minnesota = await resolveLocation(
      { cityName: "Austin", countryCode: "US", regionName: "Minnesota" },
      { lookup: labelLookup, store },
    );

    expect(texas.location.canonicalKey).toBe("US/Texas/Austin");
    expect(minnesota.location.canonicalKey).toBe("US/Minnesota/Austin");
    expect(creates).toEqual(["US/Texas/Austin", "US/Minnesota/Austin"]);
  });

  it("degrades to country (never throws) when a city cannot be resolved", async () => {
    const { store } = fakeStore();
    const res = await resolveLocation(
      { countryCode: "US", cityName: "Nowhereville" },
      {
        store,
        lookup: missLookup,
      },
    );
    expect(res.degraded).toBe(true);
    expect(res.warning).toMatch(/country level/i);
    expect(res.location).toMatchObject({ kind: "country", canonicalKey: "US" });
  });

  it("degrades when a city is requested but no lookup is available", async () => {
    const { store } = fakeStore();
    const res = await resolveLocation({ countryCode: "DE", cityName: "Berlin" }, { store });
    expect(res.degraded).toBe(true);
    expect(res.location.kind).toBe("country");
  });

  it("throws on an unsupported country (create/edit path only)", async () => {
    const { store } = fakeStore();
    await expect(resolveLocation({ countryCode: "ZZ" }, { store })).rejects.toThrow(
      /Unsupported country/,
    );
  });

  it("re-reads the winning row when a concurrent create loses the unique race", async () => {
    const rows = new Map<string, ResolvedLocation>();
    let creates = 0;
    const racingStore: LocationStore = {
      async findByKey(key) {
        return rows.get(key) ?? null;
      },
      async create(row) {
        creates += 1;
        // Simulate a concurrent writer that already inserted this canonicalKey,
        // then a unique-violation on our insert.
        rows.set(row.canonicalKey, { ...row, id: "loc_winner" });
        throw new Error("unique constraint violation");
      },
    };
    const res = await resolveLocation({ countryCode: "US" }, { store: racingStore });
    expect(res.location.id).toBe("loc_winner");
    expect(creates).toBe(1);
  });
});
