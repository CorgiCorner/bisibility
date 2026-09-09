import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createSharedLocationLookup,
  findSharedLocationByCanonicalKey,
  searchSharedLocations,
  setSharedLocationCatalogPathForTests,
} from "./common-location-catalog";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "shared-location-catalog-"));
const fixturePath = path.join(directory, "locations.json.gz");
const fixture = [
  ["ES/Andalusia", "region", 21160, "Andalusia,Spain", "Andalusia, Spain"],
  [
    "ES/Community of Madrid/Madrid",
    "city",
    1000001,
    "Madrid,Community of Madrid,Spain",
    "Madrid,Community of Madrid, Spain",
  ],
  [
    "US/Minnesota/Austin",
    "city",
    1000002,
    "Austin,Minnesota,United States",
    "Austin, Minnesota, United States",
  ],
  [
    "US/Texas/Austin",
    "city",
    1026201,
    "Austin,Texas,United States",
    "Austin, Texas, United States",
  ],
] as const;

beforeEach(async () => {
  await fs.writeFile(fixturePath, gzipSync(JSON.stringify(fixture)));
  setSharedLocationCatalogPathForTests(fixturePath);
});

afterAll(async () => {
  setSharedLocationCatalogPathForTests(null);
  await fs.rm(directory, { force: true, recursive: true });
});

describe("shared location catalog", () => {
  it("resolves an exact canonical key independently of a language qualifier", async () => {
    await expect(findSharedLocationByCanonicalKey("US/Texas/Austin@es", "city")).resolves.toEqual(
      expect.objectContaining({
        canonicalKey: "US/Texas/Austin",
        primaryGeoCode: 1026201,
        secondaryGeoName: "Austin, Texas, United States",
      }),
    );
  });

  it("searches deterministically without a provider or database", async () => {
    await expect(searchSharedLocations({ countryCode: "US", query: "Austin" })).resolves.toEqual([
      expect.objectContaining({
        canonicalKey: "US/Minnesota/Austin",
        cityName: "Austin",
        regionName: "Minnesota",
      }),
      expect.objectContaining({
        canonicalKey: "US/Texas/Austin",
        cityName: "Austin",
        regionName: "Texas",
      }),
    ]);
  });

  it("finds Madrid and an exact region key from the same fixture catalog", async () => {
    await expect(searchSharedLocations({ countryCode: "ES", query: "Madrid" })).resolves.toEqual([
      expect.objectContaining({
        canonicalKey: "ES/Community of Madrid/Madrid",
        cityName: "Madrid",
        primaryGeoCode: 1_000_001,
      }),
    ]);
    await expect(findSharedLocationByCanonicalKey("ES/Andalusia", "region")).resolves.toEqual(
      expect.objectContaining({ primaryGeoCode: 21_160 }),
    );
  });

  it("finds Madrid, Austin, and Andalusia in the committed shared artifact", async () => {
    setSharedLocationCatalogPathForTests(null);

    await expect(searchSharedLocations({ countryCode: "ES", query: "Madrid" })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalKey: "ES/Community of Madrid/Madrid",
          primaryGeoCode: 1_005_493,
        }),
      ]),
    );
    await expect(findSharedLocationByCanonicalKey("US/Texas/Austin", "city")).resolves.toEqual(
      expect.objectContaining({ primaryGeoCode: 1_026_201 }),
    );
    await expect(findSharedLocationByCanonicalKey("ES/Andalusia", "region")).resolves.toEqual(
      expect.objectContaining({ primaryGeoCode: 20_269 }),
    );
  });

  it("rejects a malformed collision before serving suggestions", async () => {
    const duplicateCode = [
      ["US/Texas/Austin", "city", 1, "Austin,Texas,United States", "Austin, Texas, United States"],
      [
        "US/Minnesota/Austin",
        "city",
        1,
        "Austin,Minnesota,United States",
        "Austin, Minnesota, United States",
      ],
    ];
    await fs.writeFile(fixturePath, gzipSync(JSON.stringify(duplicateCode)));
    setSharedLocationCatalogPathForTests(fixturePath);

    await expect(searchSharedLocations({ countryCode: "US", query: "Austin" })).rejects.toThrow(
      "repeats provider code 1",
    );
  });

  it("does not bind an ambiguous legacy city name to an arbitrary catalog entry", async () => {
    const lookup = createSharedLocationLookup();

    await expect(
      lookup.find({ cityName: "Austin", countryCode: "US", kind: "city" }),
    ).resolves.toBeNull();
    await expect(
      lookup.find({
        cityName: "Austin",
        countryCode: "US",
        kind: "city",
        selectedCanonicalKey: "US/Texas/Austin",
      }),
    ).resolves.toMatchObject({
      cityName: "Austin",
      primaryGeoCode: 1026201,
      regionName: "Texas",
    });
  });

  it("rejects fuzzy selection when earlier ranked entries hide another exact city", async () => {
    const collisionFixture = [
      ["US/Alpha/Austin", "city", 1, "Austin,Alpha,United States", "Austin,Alpha,United States"],
      ["US/Austin", "region", 2, "Austin,United States", "Austin,United States"],
      ["US/Texas/Austin", "city", 3, "Austin,Texas,United States", "Austin,Texas,United States"],
    ];
    await fs.writeFile(fixturePath, gzipSync(JSON.stringify(collisionFixture)));
    setSharedLocationCatalogPathForTests(fixturePath);
    const lookup = createSharedLocationLookup();

    await expect(
      lookup.find({ cityName: "Austin", countryCode: "US", kind: "city" }),
    ).resolves.toBeNull();
    await expect(
      lookup.find({
        cityName: "Austin",
        countryCode: "US",
        kind: "city",
        selectedCanonicalKey: "US/Missing/Austin",
      }),
    ).resolves.toBeNull();
  });

  it("retains region kind when the key has two parts", async () => {
    const lookup = createSharedLocationLookup();

    await expect(
      lookup.find({ countryCode: "ES", kind: "region", selectedCanonicalKey: "ES/Andalusia" }),
    ).resolves.toMatchObject({ kind: "region", primaryGeoCode: 21160, regionName: "Andalusia" });
  });
});
