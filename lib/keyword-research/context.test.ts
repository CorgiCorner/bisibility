import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectionResources,
  keywordResearchPageProject,
  keywordResearchProject,
  researchLocation,
} from "./context";

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { groupBy: vi.fn() },
    location: { findMany: vi.fn() },
    project: { findFirst: vi.fn() },
  },
  resolveLocation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveLocation,
}));

const provider = { id: "dataforseo", label: "DataForSEO" };
const connection = {
  credentialsEncrypted: "secret",
  id: "connection_1",
  provider: "dataforseo",
  publicId: "conn_a00000000000000000000000",
};

describe("keyword research connection IDs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.keyword.groupBy.mockResolvedValue([]);
    mocks.prisma.location.findMany.mockResolvedValue([]);
    mocks.prisma.project.findFirst.mockResolvedValue(null);
    mocks.resolveLocation.mockResolvedValue({
      location: {
        canonicalKey: "ES@en",
        gl: "ES",
        hl: "en",
        primaryGeoCode: null,
        primaryGeoName: "Spain",
        secondaryGeoName: "Spain",
      },
    });
  });

  it("loads public IDs in both project contexts", async () => {
    await keywordResearchProject("project_1");
    await keywordResearchPageProject("project_1");

    for (const [input] of mocks.prisma.project.findFirst.mock.calls) {
      expect(input).toMatchObject({
        select: {
          providerConnections: {
            select: { credentialsEncrypted: true, id: true, provider: true, publicId: true },
          },
        },
      });
    }
  });

  it("returns only strict public connection IDs", () => {
    expect(connectionResources([{ connection, provider }] as never)).toEqual([
      {
        id: "conn_a00000000000000000000000",
        label: "DataForSEO",
        provider: "dataforseo",
      },
    ]);
  });

  it.each(["connection_1", "key_a00000000000000000000000"])(
    "fails closed for stored connection ID %s",
    (publicId) => {
      expect(() =>
        connectionResources([{ connection: { ...connection, publicId }, provider }] as never),
      ).toThrow("Expected a v3 public");
    },
  );

  it("resolves a qualified country with its explicit language", async () => {
    await expect(
      researchLocation(
        {
          defaults: null,
          id: "project_1",
          keywords: [],
        } as never,
        "ES@en",
      ),
    ).resolves.toMatchObject({ key: "ES@en", value: { gl: "ES", hl: "en" } });
    expect(mocks.resolveLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { countryCode: "ES", kind: "country", languageCode: "en" },
    });
  });

  it("uses the ranked default scope when no location key is supplied", async () => {
    mocks.prisma.keyword.groupBy.mockResolvedValue([
      { _count: { _all: 4 }, device: "desktop", locationId: "loc_es" },
      { _count: { _all: 1 }, device: "desktop", locationId: "loc_de" },
    ]);
    mocks.prisma.location.findMany.mockResolvedValue([
      { countryCode: "ES", hl: "es", id: "loc_es", languageLabel: "Spanish" },
      { countryCode: "DE", hl: "de", id: "loc_de", languageLabel: "German" },
    ]);
    mocks.resolveLocation.mockResolvedValue({
      location: {
        canonicalKey: "ES",
        gl: "ES",
        hl: "es",
        primaryGeoCode: null,
        primaryGeoName: "Spain",
        secondaryGeoName: "Spain",
      },
    });

    await expect(
      researchLocation({
        defaults: null,
        id: "project_1",
        keywords: [
          { device: "desktop", location: "Germany", locationRef: { canonicalKey: "DE" } },
          {
            device: "desktop",
            location: "Malaga, Spain",
            locationRef: { canonicalKey: "ES/ES-AN/Malaga" },
          },
        ],
      } as never),
    ).resolves.toMatchObject({ key: "ES", value: { gl: "ES", hl: "es" } });
    expect(mocks.resolveLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { countryCode: "ES", kind: "country", languageCode: undefined },
    });
  });
});
