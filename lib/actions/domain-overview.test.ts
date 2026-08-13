import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeDomainOverviewAction,
  loadDomainHistoryAction,
  loadDomainKeywordsPageAction,
  loadDomainPagesPageAction,
  saveSelectedKeywordsAction,
  selectDomainOverviewMarketAction,
} from "./domain-overview";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  analyze: vi.fn(),
  history: vi.fn(),
  keywords: vi.fn(),
  pages: vi.fn(),
  project: { id: "project_1", publicId: "prj_1" },
  revalidate: vi.fn(),
  requireScope: vi.fn(),
  save: vi.fn(),
  resolveLocation: vi.fn(),
}));

vi.mock("@/lib/domain-overview/service", () => ({
  analyzeDomainOverview: mocks.analyze,
  loadDomainKeywordsPage: mocks.keywords,
  loadDomainOverviewHistory: mocks.history,
  loadDomainPagesPage: mocks.pages,
}));
vi.mock("@/lib/saved-keywords/service", () => ({ saveSavedKeywordRows: mocks.save }));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveLocation,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("./_shared", () => ({
  getActionActor: vi.fn(async () => mocks.actor),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireScope,
}));

const base = {
  languageCode: "en",
  locationCode: 2840,
  projectId: "prj_1",
  target: " example.com ",
};

describe("domain overview actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireScope.mockResolvedValue(mocks.project);
  });

  it("authorizes and delegates analysis with normalized defaults", async () => {
    const outcome = { costCents: 0, ok: false, reason: "no_source" };
    mocks.analyze.mockResolvedValue(outcome);

    await expect(analyzeDomainOverviewAction({ ...base, estimateOnly: true })).resolves.toBe(
      outcome,
    );
    expect(mocks.analyze).toHaveBeenCalledWith(
      { actorId: "user_1", projectId: "project_1" },
      expect.objectContaining({
        estimateOnly: true,
        fresh: false,
        languageCode: "en",
        locationCode: 2840,
        target: "example.com",
      }),
    );
  });

  it("delegates provider pagination while sort and filters stay free client state", async () => {
    const input = {
      ...base,
      filters: { intent: "commercial" },
      limit: 250,
      maxCostCents: 9,
      offset: 1_250,
    };
    await loadDomainKeywordsPageAction({ ...input, sort: "traffic-desc" });
    await loadDomainPagesPageAction(input);

    const expected = expect.objectContaining({ limit: 250, offset: 1_250 });
    expect(mocks.keywords).toHaveBeenCalledWith(
      { actorId: "user_1", projectId: "project_1" },
      expected,
    );
    expect(mocks.pages).toHaveBeenCalledWith(
      { actorId: "user_1", projectId: "project_1" },
      expected,
    );
  });

  it("saves selected rows for later and refreshes both destinations", async () => {
    mocks.save.mockResolvedValue({ savedCount: 1 });
    await saveSelectedKeywordsAction({
      ...base,
      rows: [
        {
          keyword: "rank tracker",
          location: "US",
          searchVolume: 100,
          variantCount: 0,
        },
      ],
    });

    expect(mocks.save).toHaveBeenCalledWith(
      [expect.objectContaining({ keyword: "rank tracker", location: "US" })],
      { actorId: "user_1", projectId: "project_1", projectPublicId: "prj_1" },
    );
    expect(mocks.revalidate).toHaveBeenCalledTimes(2);
  });

  it("resolves a selected market through the shared persisted location path", async () => {
    mocks.resolveLocation.mockResolvedValue({
      location: { canonicalKey: "US/Texas/Austin", primaryGeoCode: 1_026_201 },
    });
    await expect(
      selectDomainOverviewMarketAction({
        canonicalKey: "US/Texas/Austin",
        projectId: "prj_1",
      }),
    ).resolves.toEqual({
      canonicalKey: "US/Texas/Austin",
      locationCode: 1_026_201,
      supported: true,
    });
    expect(mocks.resolveLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });
  });

  it("resolves a supported country when its shared location row uses a provider name", async () => {
    mocks.resolveLocation.mockResolvedValue({
      location: {
        canonicalKey: "US",
        countryCode: "US",
        kind: "country",
        primaryGeoCode: null,
      },
    });
    await expect(
      selectDomainOverviewMarketAction({ canonicalKey: "US", projectId: "prj_1" }),
    ).resolves.toEqual({ canonicalKey: "US", locationCode: 2840, supported: true });
  });

  it("returns an explicit unsupported result for a city without a numeric Labs handle", async () => {
    mocks.resolveLocation.mockResolvedValue({
      location: {
        canonicalKey: "US/Texas/Austin",
        countryCode: "US",
        kind: "city",
        primaryGeoCode: null,
      },
    });
    await expect(
      selectDomainOverviewMarketAction({
        canonicalKey: "US/Texas/Austin",
        projectId: "prj_1",
      }),
    ).resolves.toEqual({
      canonicalKey: "US/Texas/Austin",
      locationCode: null,
      supported: false,
    });
  });

  it("rejects invalid market and pagination input before authorization", async () => {
    await expect(analyzeDomainOverviewAction({ ...base, locationCode: 0 })).rejects.toThrow();
    await expect(
      loadDomainKeywordsPageAction({ ...base, limit: 1001, offset: 0 }),
    ).rejects.toThrow();
    expect(mocks.requireScope).not.toHaveBeenCalled();
  });

  it("requires an explicit cost ceiling at every paid action boundary", async () => {
    await expect(analyzeDomainOverviewAction({ ...base, estimateOnly: false })).rejects.toThrow(
      /maximum cost/i,
    );
    await expect(loadDomainHistoryAction(base)).rejects.toThrow();
    await expect(
      loadDomainKeywordsPageAction({ ...base, limit: 100, offset: 0 }),
    ).rejects.toThrow();
    expect(mocks.requireScope).not.toHaveBeenCalled();
  });
});
