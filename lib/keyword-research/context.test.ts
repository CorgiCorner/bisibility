import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectionResources,
  keywordResearchPageProject,
  keywordResearchProject,
  researchLocation,
} from "./context";

const mocks = vi.hoisted(() => ({
  defaultMarket: vi.fn(),
  project: { findFirst: vi.fn() },
  resolveLocation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { project: mocks.project } }));
vi.mock("@/lib/serp/default-market", () => ({
  projectDefaultSerpMarket: mocks.defaultMarket,
}));
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
    mocks.project.findFirst.mockResolvedValue(null);
    mocks.defaultMarket.mockReturnValue({ locationKey: "US" });
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

    for (const [input] of mocks.project.findFirst.mock.calls) {
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

  it("resolves a qualified country market with its explicit language", async () => {
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
});
