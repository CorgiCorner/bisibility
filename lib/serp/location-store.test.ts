import { beforeEach, describe, expect, it, vi } from "vitest";
import { type LocationCandidate, LocationInputError, type ResolvedLocation } from "./location";
import { prismaLocationStore } from "./location-store";

const mocks = vi.hoisted(() => ({
  prisma: {
    location: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("server-only", () => ({}));

// A Prisma Location row (carries the enum kind + timestamps the neutral type drops).
function prismaRow(overrides: Record<string, unknown> = {}) {
  return {
    canonicalKey: "US/US-TX/Austin",
    cityName: "Austin",
    countryCode: "US",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    displayName: "Austin,Texas,United States",
    gl: "us",
    hl: "en",
    id: "loc_1",
    kind: "city",
    languageCode: "en",
    languageLabel: "English",
    primaryGeoCode: 1026201,
    primaryGeoName: "Austin,Texas,United States",
    regionCode: "US-TX",
    secondaryGeoName: "Austin,Texas,United States",
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

const expectedResolved: ResolvedLocation = {
  canonicalKey: "US/US-TX/Austin",
  cityName: "Austin",
  countryCode: "US",
  displayName: "Austin,Texas,United States",
  gl: "us",
  hl: "en",
  id: "loc_1",
  kind: "city",
  languageCode: "en",
  languageLabel: "English",
  primaryGeoCode: 1026201,
  primaryGeoName: "Austin,Texas,United States",
  regionCode: "US-TX",
  secondaryGeoName: "Austin,Texas,United States",
};

const austin: LocationCandidate = {
  cityName: "Austin",
  countryCode: "US",
  displayName: "Austin,Texas,United States",
  kind: "city",
  primaryGeoCode: 1026201,
  primaryGeoName: "Austin,Texas,United States",
  regionCode: "US-TX",
  secondaryGeoName: "Austin,Texas,United States",
};

const malaga: LocationCandidate = {
  cityName: "Malaga",
  countryCode: "ES",
  displayName: "Malaga,Andalusia,Spain",
  kind: "city",
  primaryGeoCode: 21160,
  primaryGeoName: "Malaga,Andalusia,Spain",
  regionCode: null,
  regionName: "Andalusia",
  secondaryGeoName: "Malaga,Andalusia,Spain",
};

function enrich(location: ResolvedLocation, candidate: LocationCandidate) {
  const handler = prismaLocationStore.enrich;
  if (!handler) throw new Error("Prisma location store must support enrichment.");
  return handler.call(prismaLocationStore, location, candidate);
}

describe("prismaLocationStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("findByKey maps a Prisma row (enum kind, no timestamps) to ResolvedLocation", async () => {
    mocks.prisma.location.findUnique.mockResolvedValue(prismaRow());

    const result = await prismaLocationStore.findByKey("US/US-TX/Austin");

    expect(mocks.prisma.location.findUnique).toHaveBeenCalledWith({
      where: { canonicalKey: "US/US-TX/Austin" },
    });
    expect(result).toEqual(expectedResolved);
  });

  it("findByKey returns null when the row is absent", async () => {
    mocks.prisma.location.findUnique.mockResolvedValue(null);
    expect(await prismaLocationStore.findByKey("XX")).toBeNull();
  });

  it("create upserts by canonicalKey with an empty update (idempotent, existing row wins)", async () => {
    mocks.prisma.location.upsert.mockResolvedValue(prismaRow());
    const { id: _id, ...row } = expectedResolved;

    const result = await prismaLocationStore.create(row);

    expect(mocks.prisma.location.upsert).toHaveBeenCalledWith({
      create: row,
      update: {},
      where: { canonicalKey: "US/US-TX/Austin" },
    });
    expect(result).toEqual(expectedResolved);
  });

  it("repairs a missing secondary provider handle without changing the cached row identity", async () => {
    const cached = { ...expectedResolved, secondaryGeoName: "United States" };
    mocks.prisma.location.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.location.findUnique.mockResolvedValue(
      prismaRow({ secondaryGeoName: austin.secondaryGeoName }),
    );

    const result = await enrich(cached, austin);

    expect(mocks.prisma.location.updateMany).toHaveBeenCalledWith({
      data: { secondaryGeoName: "Austin,Texas,United States" },
      where: {
        canonicalKey: "US/US-TX/Austin",
        countryCode: "US",
        id: "loc_1",
        kind: "city",
        primaryGeoCode: 1026201,
        primaryGeoName: "Austin,Texas,United States",
        secondaryGeoName: "United States",
      },
    });
    expect(result).toMatchObject({
      id: "loc_1",
      canonicalKey: "US/US-TX/Austin",
      primaryGeoCode: 1026201,
      secondaryGeoName: "Austin,Texas,United States",
    });
  });

  it("repairs a missing primary provider handle while retaining an explicit language key", async () => {
    const cached: ResolvedLocation = {
      ...expectedResolved,
      canonicalKey: "ES/Andalusia/Malaga@en",
      cityName: "Malaga",
      countryCode: "ES",
      displayName: "Malaga,Andalusia,Spain",
      gl: "es",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoCode: null,
      primaryGeoName: "Spain",
      regionCode: null,
      secondaryGeoName: "Malaga,Andalusia,Spain",
    };
    mocks.prisma.location.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.location.findUnique.mockResolvedValue(
      prismaRow({
        canonicalKey: cached.canonicalKey,
        cityName: cached.cityName,
        countryCode: cached.countryCode,
        displayName: cached.displayName,
        gl: cached.gl,
        hl: cached.hl,
        languageCode: cached.languageCode,
        languageLabel: cached.languageLabel,
        primaryGeoCode: malaga.primaryGeoCode,
        primaryGeoName: malaga.primaryGeoName,
        regionCode: cached.regionCode,
        secondaryGeoName: cached.secondaryGeoName,
      }),
    );

    const result = await enrich(cached, malaga);

    expect(mocks.prisma.location.updateMany).toHaveBeenCalledWith({
      data: { primaryGeoCode: 21160, primaryGeoName: "Malaga,Andalusia,Spain" },
      where: {
        canonicalKey: "ES/Andalusia/Malaga@en",
        countryCode: "ES",
        id: "loc_1",
        kind: "city",
        primaryGeoCode: null,
        primaryGeoName: "Spain",
        secondaryGeoName: "Malaga,Andalusia,Spain",
      },
    });
    expect(result).toMatchObject({
      id: "loc_1",
      canonicalKey: "ES/Andalusia/Malaga@en",
      languageCode: "en",
      primaryGeoCode: 21160,
    });
  });

  it("rejects a different primary numeric code before filling a missing secondary handle", async () => {
    const cached = {
      ...expectedResolved,
      primaryGeoCode: 999999,
      primaryGeoName: "Different Austin,United States",
      secondaryGeoName: "United States",
    };

    await expect(enrich(cached, austin)).rejects.toBeInstanceOf(LocationInputError);

    expect(mocks.prisma.location.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a conflicting primary name even when its numeric code is missing", async () => {
    const cached = {
      ...expectedResolved,
      primaryGeoCode: null,
      primaryGeoName: "Dallas,Texas,United States",
    };

    await expect(enrich(cached, austin)).rejects.toMatchObject({ field: "canonicalKey" });

    expect(mocks.prisma.location.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a conflicting secondary provider handle", async () => {
    const cached = {
      ...expectedResolved,
      secondaryGeoName: "Dallas,Texas,United States",
    };

    await expect(enrich(cached, austin)).rejects.toMatchObject({ field: "canonicalKey" });

    expect(mocks.prisma.location.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a conflicting handle observed after the guarded update races", async () => {
    const cached = { ...expectedResolved, secondaryGeoName: "United States" };
    mocks.prisma.location.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.location.findUnique.mockResolvedValue(
      prismaRow({
        primaryGeoCode: 999999,
        primaryGeoName: "Dallas,Texas,United States",
      }),
    );

    await expect(enrich(cached, austin)).rejects.toMatchObject({ field: "canonicalKey" });
  });

  it("does not enrich a row from a candidate with a different canonical geography", async () => {
    const candidate = {
      ...austin,
      cityName: "Dallas",
      displayName: "Dallas,Texas,United States",
      primaryGeoCode: 1026202,
      primaryGeoName: "Dallas,Texas,United States",
      secondaryGeoName: "Dallas,Texas,United States",
    };

    const result = await enrich(expectedResolved, candidate);

    expect(mocks.prisma.location.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual(expectedResolved);
  });
});
