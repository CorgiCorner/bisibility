import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDomainOverviewMarket, getDomainOverviewPageContext } from "./domain-overview";

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
      canonicalKey: "US",
      cityName: null,
      countryCode: "US",
      displayName: "United States",
      hl: "en",
      kind: "country",
      languageLabel: "English",
      primaryGeoCode: 2840,
    });
    mocks.projectDetails.mockResolvedValue({
      competitors: [{ domain: "competitor.example.com" }],
      defaults: null,
      providerConnections: [{ provider: "dataforseo", status: "connected" }],
    });
  });

  it("returns provider state, project suggestions, recents, market, and spend", async () => {
    await expect(getDomainOverviewPageContext("prj_1")).resolves.toEqual({
      competitorDomains: ["competitor.example.com"],
      costContext: { capCents: 5000, spentCents: 125 },
      defaultMarket: {
        canonicalKey: "US",
        cityName: null,
        countryCode: "US",
        displayName: "United States",
        kind: "country",
        languageCode: "en",
        languageLabel: "English",
        locationCode: 2840,
        regionName: null,
      },
      defaultTarget: "example.com",
      providerStatus: "connected",
      recentTargets: [{ target: "example.com" }],
    });
    expect(mocks.recent).toHaveBeenCalledWith("project_1");
    expect(mocks.cost).toHaveBeenCalledWith("prj_1");
  });

  it("resolves a URL-selected market within the project authorization boundary", async () => {
    await expect(getDomainOverviewMarket("prj_1", "US")).resolves.toEqual({
      canonicalKey: "US",
      cityName: null,
      countryCode: "US",
      displayName: "United States",
      kind: "country",
      languageCode: "en",
      languageLabel: "English",
      locationCode: 2840,
      regionName: null,
    });
    expect(mocks.readable).toHaveBeenCalledWith("prj_1");
    expect(mocks.location.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { canonicalKey: "US" } }),
    );
  });

  it("maps a country row without a city geo handle to its supported Labs country code", async () => {
    mocks.location.findUnique.mockResolvedValueOnce({
      canonicalKey: "US",
      cityName: null,
      countryCode: "US",
      displayName: "United States",
      hl: "en",
      kind: "country",
      languageLabel: "English",
      primaryGeoCode: null,
    });

    await expect(getDomainOverviewMarket("prj_1", "US")).resolves.toMatchObject({
      displayName: "United States",
      locationCode: 2840,
    });
  });

  it("distinguishes reauthentication from no capable provider", async () => {
    mocks.projectDetails.mockResolvedValueOnce({
      competitors: [],
      defaults: null,
      providerConnections: [{ provider: "dataforseo", status: "needs_reauth" }],
    });
    await expect(getDomainOverviewPageContext("prj_1")).resolves.toMatchObject({
      providerStatus: "needs_reauth",
    });

    mocks.projectDetails.mockResolvedValueOnce({
      competitors: [],
      defaults: null,
      providerConnections: [{ provider: "serpapi", status: "connected" }],
    });
    await expect(getDomainOverviewPageContext("prj_1")).resolves.toMatchObject({
      providerStatus: "no_provider",
    });
  });
});
