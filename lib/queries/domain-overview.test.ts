import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDomainOverviewPageContext } from "./domain-overview";

const mocks = vi.hoisted(() => ({
  cost: vi.fn(),
  location: { findUnique: vi.fn() },
  projectDetails: vi.fn(),
  readable: vi.fn(),
  recent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { location: mocks.location, project: { findUnique: mocks.projectDetails } },
}));
vi.mock("@/lib/domain-overview/recent", () => ({
  recentDomainOverviewTargets: mocks.recent,
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.readable }));
vi.mock("./cost-calculator", () => ({ getProjectCostContext: mocks.cost }));

describe("domain overview page context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readable.mockResolvedValue({
      project: { domain: "example.com", id: "project_1", publicId: "prj_1" },
    });
    mocks.cost.mockResolvedValue({ capCents: 5000, spentCents: 125 });
    mocks.recent.mockResolvedValue([{ target: "example.com" }]);
    mocks.location.findUnique.mockResolvedValue({
      countryCode: "US",
      languageCode: "en",
      languageLabel: "English",
    });
    mocks.projectDetails.mockResolvedValue({
      competitors: [{ domain: "competitor.example.com" }],
      defaults: null,
      markets: [],
      providerConnections: [{ provider: "dataforseo", status: "connected" }],
    });
  });

  it("returns provider state, project suggestions, recents, scope, and spend", async () => {
    await expect(getDomainOverviewPageContext("prj_1")).resolves.toMatchObject({
      catalogScopes: expect.any(Array),
      competitorDomains: ["competitor.example.com"],
      costContext: { capCents: 5000, spentCents: 125 },
      defaultScope: {
        countryCode: "US",
        countryName: "United States",
        languageCode: "en",
        languageLabel: "English",
        providerLocationCode: 2840,
        researchAvailable: true,
      },
      defaultTarget: "example.com",
      providerStatus: "connected",
      recentTargets: [{ target: "example.com" }],
      trackedScopes: [],
    });
    expect(mocks.recent).toHaveBeenCalledWith("project_1");
    expect(mocks.cost).toHaveBeenCalledWith("prj_1");
  });

  it("deduplicates tracked country-language pairs and preserves unavailable pairs", async () => {
    mocks.projectDetails.mockResolvedValueOnce({
      competitors: [],
      defaults: null,
      markets: [
        { location: { countryCode: "ES", languageCode: "es", languageLabel: "Spanish" } },
        { location: { countryCode: "ES", languageCode: "es", languageLabel: "Spanish" } },
        { location: { countryCode: "ES", languageCode: "en", languageLabel: "English" } },
      ],
      providerConnections: [{ provider: "dataforseo", status: "connected" }],
    });

    const context = await getDomainOverviewPageContext("prj_1");
    expect(context.trackedScopes).toEqual([
      expect.objectContaining({
        countryCode: "ES",
        languageCode: "es",
        researchAvailable: true,
      }),
      expect.objectContaining({
        countryCode: "ES",
        languageCode: "en",
        researchAvailable: false,
      }),
    ]);
    expect(context.catalogScopes).not.toContainEqual(
      expect.objectContaining({ countryCode: "ES", languageCode: "es" }),
    );
  });

  it("distinguishes reauthentication from no capable provider", async () => {
    mocks.projectDetails.mockResolvedValueOnce({
      competitors: [],
      defaults: null,
      markets: [],
      providerConnections: [{ provider: "dataforseo", status: "needs_reauth" }],
    });
    await expect(getDomainOverviewPageContext("prj_1")).resolves.toMatchObject({
      providerStatus: "needs_reauth",
    });

    mocks.projectDetails.mockResolvedValueOnce({
      competitors: [],
      defaults: null,
      markets: [],
      providerConnections: [{ provider: "serpapi", status: "connected" }],
    });
    await expect(getDomainOverviewPageContext("prj_1")).resolves.toMatchObject({
      providerStatus: "no_provider",
    });
  });
});
