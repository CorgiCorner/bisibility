import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedLocation } from "./location";
import { prismaLocationStore } from "./location-store";

const mocks = vi.hoisted(() => ({
  prisma: {
    location: {
      findUnique: vi.fn(),
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
  languageLabel: "English",
  primaryGeoCode: 1026201,
  primaryGeoName: "Austin,Texas,United States",
  regionCode: "US-TX",
  secondaryGeoName: "Austin,Texas,United States",
};

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
});
