import { beforeEach, describe, expect, it, vi } from "vitest";
import { getKeywordResearchPageContext } from "./keyword-research";

const mocks = vi.hoisted(() => ({
  connectionResources: vi.fn(),
  defaultMarket: vi.fn(),
  eligible: vi.fn(),
  pageProject: vi.fn(),
  readable: vi.fn(),
}));

vi.mock("@/lib/keyword-research/context", () => ({
  connectionResources: mocks.connectionResources,
  eligibleResearchConnections: mocks.eligible,
  keywordResearchPageProject: mocks.pageProject,
}));
vi.mock("@/lib/keyword-research/default-market", () => ({
  keywordResearchDefaultMarket: mocks.defaultMarket,
}));
vi.mock("@/lib/serp/location", () => ({
  countrySeed: () => ({ countryCode: "US", hl: "en", languageLabel: "English" }),
  locationLanguage: (_countryCode: string, languageCode?: string) => ({
    code: languageCode ?? "en",
    label: languageCode === "es" ? "Spanish" : "English",
  }),
  normalizeCanonicalLocationKey: (locationKey: string) => {
    const [countryCode, languageCode] = locationKey.split("@");
    return {
      canonicalKey: locationKey,
      selector: { countryCode, kind: "country", languageCode },
    };
  },
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.readable }));

describe("keyword research page connection IDs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readable.mockResolvedValue({
      project: {
        domain: "example.com",
        id: "project_1",
        name: "Example",
        publicId: "prj_a00000000000000000000000",
      },
    });
    mocks.pageProject.mockResolvedValue({ id: "project_1", providerConnections: [] });
    mocks.defaultMarket.mockResolvedValue({
      locationRef: null,
      market: { city: null, displayName: "United States", locationKey: "US" },
    });
    mocks.eligible.mockReturnValue([]);
  });

  it("returns strict public connection IDs", async () => {
    mocks.connectionResources.mockReturnValue([
      {
        id: "conn_a00000000000000000000000",
        label: "DataForSEO",
        provider: "dataforseo",
      },
    ]);

    await expect(
      getKeywordResearchPageContext("prj_a00000000000000000000000"),
    ).resolves.toMatchObject({
      connections: [{ id: "conn_a00000000000000000000000" }],
    });
  });

  it("preserves a qualified default market instead of replacing its language", async () => {
    mocks.defaultMarket.mockResolvedValue({
      locationRef: null,
      market: { city: null, displayName: "Spain - English", locationKey: "ES@en" },
    });

    await expect(
      getKeywordResearchPageContext("prj_a00000000000000000000000"),
    ).resolves.toMatchObject({
      language: { code: "en", label: "English" },
      location: { canonicalKey: "ES@en", countryCode: "ES", hl: "en" },
    });
  });

  it.each(["connection_1", "key_a00000000000000000000000"])(
    "fails closed for connection ID %s",
    async (id) => {
      mocks.connectionResources.mockReturnValue([
        { id, label: "DataForSEO", provider: "dataforseo" },
      ]);

      await expect(
        getKeywordResearchPageContext("prj_a00000000000000000000000"),
      ).rejects.toMatchObject({ code: "invalid_public_id" });
    },
  );
});
