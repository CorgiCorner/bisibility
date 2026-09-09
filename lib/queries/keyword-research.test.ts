import { beforeEach, describe, expect, it, vi } from "vitest";
import { getKeywordResearchPageContext } from "./keyword-research";

const mocks = vi.hoisted(() => ({
  defaultResearch: vi.fn(),
  connectionResources: vi.fn(),
  defaultScope: vi.fn(),
  eligible: vi.fn(),
  pageProject: vi.fn(),
  readable: vi.fn(),
}));

vi.mock("@/lib/keyword-research/context", () => ({
  connectionResources: mocks.connectionResources,
  eligibleResearchConnections: mocks.eligible,
  keywordResearchPageProject: mocks.pageProject,
}));
vi.mock("@/lib/keyword-research/default-scope", () => ({
  keywordResearchDefault: mocks.defaultResearch,
  keywordResearchDefaultScope: mocks.defaultScope,
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
    mocks.defaultScope.mockResolvedValue({
      countryCode: "US",
      countryName: "United States",
      languageCode: "en",
      languageLabel: "English",
      providerLocationCode: 2840,
      researchAvailable: true,
    });
    mocks.defaultResearch.mockResolvedValue({
      device: "desktop",
      scope: {
        countryCode: "US",
        countryName: "United States",
        languageCode: "en",
        languageLabel: "English",
        providerLocationCode: 2840,
        researchAvailable: true,
      },
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

  it("returns the default country and language pair", async () => {
    mocks.defaultResearch.mockResolvedValue({
      device: "desktop",
      scope: {
        countryCode: "ES",
        countryName: "Spain",
        languageCode: "en",
        languageLabel: "English",
        providerLocationCode: 2724,
        researchAvailable: false,
      },
    });

    await expect(
      getKeywordResearchPageContext("prj_a00000000000000000000000"),
    ).resolves.toMatchObject({
      defaultScope: { countryCode: "ES", languageCode: "en", languageLabel: "English" },
    });
  });

  it("keeps the most-tracked device when no default is configured", async () => {
    mocks.pageProject.mockResolvedValue({
      defaults: null,
      id: "project_1",
      providerConnections: [],
    });
    mocks.defaultResearch.mockResolvedValue({
      device: "mobile",
      scope: {
        countryCode: "ES",
        countryName: "Spain",
        languageCode: "es",
        languageLabel: "Spanish",
        providerLocationCode: 2724,
        researchAvailable: true,
      },
    });

    await expect(
      getKeywordResearchPageContext("prj_a00000000000000000000000"),
    ).resolves.toMatchObject({ defaultDevice: "mobile" });
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
