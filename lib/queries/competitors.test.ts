import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCompetitorsApiView, getCompetitorsView } from "./competitors";

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  policies: vi.fn(),
  read: vi.fn(),
  project: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("./_auth", () => ({
  requireReadableProject: mocks.read,
  requireReadableProjectFor: mocks.read,
}));
vi.mock("./competitor-current-data", () => ({ loadCompetitorCurrentData: mocks.current }));
vi.mock("./competitor-policies", () => ({ loadCompetitorPolicies: mocks.policies }));
const project = {
  id: "internal",
  publicId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
  domain: "example.test",
};
const actor = { id: "user" };
const location = {
  id: "us",
  canonicalKey: "country:us",
  cityName: null,
  countryCode: "US",
  displayName: "United States",
  hl: "en",
  kind: "country",
  languageLabel: "English",
  regionCode: null,
};
const observation = {
  id: "kw",
  keyword: "test",
  tags: [],
  completed: true,
  ranked: true,
  volume: 100,
  ranks: { "example.test": 1, "rival.test": 2 },
  quality: {
    "example.test": { evidence: "positive", freshness: "fresh", reason: null },
    "rival.test": { evidence: "positive", freshness: "fresh", reason: null },
  },
};
describe("current competitor query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ actor, project });
    mocks.project.mockResolvedValue(project);
    mocks.transaction.mockImplementation((run) =>
      run({ project: { findUniqueOrThrow: mocks.project } }),
    );
    mocks.policies.mockResolvedValue([
      {
        domain: "rival.test",
        label: "Rival",
        publicId: "cmp_aaaaaaaaaaaaaaaaaaaaaaaa",
        scopePolicy: "all_markets",
        marketOverrides: [],
      },
    ]);
    mocks.current.mockResolvedValue({
      candidates: [{ id: "keyword", publicId: "kw", device: "desktop", locationRef: location }],
      suggestionRows: [
        { keywordId: "keyword", ranks: [{ domain: "suggestion.test", position: 3 }] },
      ],
      observationsFor: () => [observation],
    });
  });
  it("reauthenticates through the current-data port inside the same snapshot and preserves suggestions", async () => {
    const view = await getCompetitorsView(project.publicId);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
    expect(mocks.current).toHaveBeenCalledWith(expect.anything(), actor, project, undefined);
    expect(view.market?.quality).toMatchObject({ expected: 1, measured: 1 });
    expect(view.suggestions.map((item) => item.domain)).toEqual(["suggestion.test"]);
  });
  it("does not widen an explicit market with no matching target", async () => {
    const view = await getCompetitorsView(project.publicId, {
      engine: "google",
      locationId: "other",
      device: "desktop",
    });
    expect(view.market).toBeNull();
    expect(view.scope?.locationId).toBe("other");
  });
  it("retains the full API market projection and selected managed domains", async () => {
    const view = await getCompetitorsApiView(project.publicId);
    expect(view.markets).toHaveLength(1);
    expect(view.markets[0].columns.map((column) => column.domain)).toEqual([
      "example.test",
      "rival.test",
    ]);
  });
  it("does not run a data read after failed project authorization", async () => {
    mocks.read.mockRejectedValue(new Error("forbidden"));
    await expect(getCompetitorsView(project.publicId)).rejects.toThrow("forbidden");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("selects the most-checked market deterministically rather than the first location", async () => {
    const more = {
      ...location,
      id: "pl",
      canonicalKey: "country:pl",
      displayName: "Poland",
      countryCode: "PL",
    };
    mocks.current.mockResolvedValue({
      candidates: [
        { id: "a", publicId: "a", device: "desktop", locationRef: location },
        { id: "b", publicId: "b", device: "desktop", locationRef: more },
      ],
      suggestionRows: [],
      observationsFor: (_columns: unknown, id: string) =>
        id === "pl" ? [observation, { ...observation, id: "kw2" }] : [],
    });
    expect((await getCompetitorsView(project.publicId)).market?.locationId).toBe("pl");
  });
  it("applies market competitor exclusion to both devices without hiding the other market", async () => {
    mocks.policies.mockResolvedValue([
      {
        domain: "rival.test",
        label: "Rival",
        publicId: "cmp_aaaaaaaaaaaaaaaaaaaaaaaa",
        scopePolicy: "all_markets",
        marketOverrides: [{ mode: "excluded", projectMarket: { locationId: "us" } }],
      },
    ]);
    mocks.current.mockResolvedValue({
      candidates: [
        { id: "a", publicId: "a", device: "desktop", locationRef: location },
        { id: "b", publicId: "b", device: "mobile", locationRef: location },
      ],
      suggestionRows: [],
      observationsFor: () => [observation],
    });
    const result = await getCompetitorsApiView(project.publicId);
    expect(result.markets).toHaveLength(2);
    expect(result.markets.every((market) => market.columns.length === 1)).toBe(true);
  });
  it("keeps missing current proof unknown rather than reading another legacy raw check", async () => {
    mocks.current.mockResolvedValue({
      candidates: [{ id: "a", publicId: "a", device: "desktop", locationRef: location }],
      suggestionRows: [],
      observationsFor: () => [{ ...observation, quality: undefined }],
    });
    const result = await getCompetitorsView(project.publicId);
    expect(result.market?.dataState).toBe("quality_unknown");
    expect(result.market?.shares.every((share) => share.shareOfVoice === null)).toBe(true);
  });
});
