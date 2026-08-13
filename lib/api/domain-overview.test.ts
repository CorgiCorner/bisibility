import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import {
  postDomainOverviewAnalyze,
  postDomainOverviewHistory,
  postDomainOverviewKeywords,
  postDomainOverviewPages,
} from "./domain-overview";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  history: vi.fn(),
  keywords: vi.fn(),
  pages: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/domain-overview/service", () => ({
  analyzeDomainOverview: mocks.analyze,
  loadDomainKeywordsPage: mocks.keywords,
  loadDomainOverviewHistory: mocks.history,
  loadDomainPagesPage: mocks.pages,
}));

const commonBody = {
  language_code: "en",
  location_code: 2840,
  max_cost_cents: 20,
  target: "example.com",
};

const moduleSuccess = {
  cached: false,
  costCents: 1.25,
  data: { costCents: 1.25, rows: [], totalCount: 10 },
  fetchedAt: "2026-08-13T10:00:00.000Z",
  ok: true as const,
};

const metrics = {
  count: 1,
  estimatedTrafficCostCents: 250.5,
  etv: 12.5,
  isDown: 1,
  isLost: 2,
  isNew: 3,
  isUp: 4,
  pos1: 5,
  pos2_3: 6,
  pos4_10: 7,
  pos11_20: 8,
  pos21_30: 9,
  pos31_40: 10,
  pos41_50: 11,
  pos51_60: 12,
  pos61_70: 13,
  pos71_80: 14,
  pos81_90: 15,
  pos91_100: 16,
};

function context(action: string, body: unknown) {
  const url = new URL(`https://example.test/api/v1/projects/prj_1/domain-overview/${action}`);
  return {
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: "prj_1" } },
    headers: new Headers({ "RateLimit-Remaining": "99" }),
    instance: "urn:test",
    method: "POST",
    path: ["projects", "prj_1", "domain-overview", action],
    req: new Request(url, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    url,
  } as ApiContext;
}

describe("Domain Overview REST handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.analyze.mockResolvedValue({
      cached: true,
      estimate: true,
      estimatedCostCents: 0,
      freshEstimatedCostCents: 5.5,
      historyEstimatedCostCents: 12.12,
      historyMode: "lazy",
      keywordPageEstimatedCostCents: 2.02,
      languageCode: "en",
      locationCode: 2840,
      ok: true,
      pagePageEstimatedCostCents: 2.02,
      provider: "dataforseo",
      scope: "root",
      target: "example.com",
    });
    mocks.history.mockResolvedValue({ ...moduleSuccess, data: [] });
    mocks.keywords.mockResolvedValue(moduleSuccess);
    mocks.pages.mockResolvedValue(moduleSuccess);
  });

  it("parses a free estimate and removes only the top-level ok discriminator", async () => {
    const response = await postDomainOverviewAnalyze(
      context("analyze", {
        estimate_only: true,
        fresh: true,
        keyword_limit: 50,
        language_code: "en",
        location_code: 2840,
        page_limit: 250,
        scope_override: "subdomain",
        target: "blog.example.com",
      }),
      "prj_1",
    );

    expect(mocks.analyze).toHaveBeenCalledWith(
      { actorId: "user_1", projectId: "project_1" },
      {
        estimateOnly: true,
        fresh: true,
        keywordLimit: 50,
        languageCode: "en",
        locationCode: 2840,
        maxCostCents: undefined,
        pageLimit: 250,
        scopeOverride: "subdomain",
        target: "blog.example.com",
      },
    );
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        estimate: true,
        estimated_cost_cents: 0,
        fresh_estimated_cost_cents: 5.5,
      },
    });
    expect(body.data.ok).toBeUndefined();
  });

  it("keeps nested module discriminators in a partial paid report", async () => {
    mocks.analyze.mockResolvedValue({
      cached: false,
      cachedUntil: "2026-08-14T10:00:00.000Z",
      costCents: 3.75,
      fetchedAt: "2026-08-13T10:00:00.000Z",
      historyMode: "lazy",
      keywords: moduleSuccess,
      languageCode: "en",
      locationCode: 2840,
      ok: true,
      overview: null,
      pages: { costCents: 2.5, ok: false, reason: "lookup_failed" },
      previousFetchedAt: null,
      previousOverview: null,
      previousSourceSnapshotAt: null,
      provider: "dataforseo",
      scope: "root",
      sourceSnapshotAt: null,
      state: "partial",
      target: "example.com",
    });

    const response = await postDomainOverviewAnalyze(context("analyze", commonBody), "prj_1");

    expect(mocks.analyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ maxCostCents: 20 }),
    );
    await expect(response.json()).resolves.toMatchObject({
      data: {
        cost_cents: 3.75,
        keywords: { ok: true },
        pages: { cost_cents: 2.5, ok: false, reason: "lookup_failed" },
        state: "partial",
      },
    });
  });

  it.each([
    ["history", postDomainOverviewHistory, mocks.history],
    ["keywords", postDomainOverviewKeywords, mocks.keywords],
    ["pages", postDomainOverviewPages, mocks.pages],
  ] as const)("serializes the %s module envelope", async (action, handler, loader) => {
    const body = action === "history" ? commonBody : { ...commonBody, limit: 100, offset: 200 };
    const response = await handler(context(action, body), "prj_1");

    expect(loader).toHaveBeenCalledOnce();
    expect(loader).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ maxCostCents: 20 }),
    );
    expect(response).toBeDefined();
    if (!response) throw new Error("Expected a module response");
    await expect(response.json()).resolves.toMatchObject({
      data: { cached: false, cost_cents: 1.25, fetched_at: moduleSuccess.fetchedAt },
    });
  });

  it("serializes populated metrics and module rows with the documented field names", async () => {
    mocks.analyze.mockResolvedValue({
      cached: false,
      cachedUntil: "2026-08-14T10:00:00.000Z",
      costCents: 4.5,
      fetchedAt: "2026-08-13T10:00:00.000Z",
      historyMode: "lazy",
      keywords: {
        ...moduleSuccess,
        data: {
          costCents: 1.25,
          rows: [
            {
              cpcCents: 42.5,
              difficulty: 11,
              estimatedTraffic: 9.5,
              intent: "commercial",
              keyword: "example",
              position: 2,
              rankAbsolute: 3,
              rankAbsoluteDelta: -1,
              rankingUrl: "https://example.com/",
              searchVolume: 100,
              serpFeatures: ["organic"],
            },
          ],
          totalCount: 1,
        },
      },
      languageCode: "en",
      locationCode: 2840,
      ok: true,
      overview: metrics,
      pages: {
        ...moduleSuccess,
        data: {
          costCents: 1.25,
          rows: [
            {
              etv: 8.5,
              etvDeltaPct: -2.5,
              keywordCount: 4,
              path: "/pricing",
              topKeyword: "example pricing",
              topKeywordPosition: 3,
            },
          ],
          totalCount: 1,
        },
      },
      previousFetchedAt: null,
      previousOverview: null,
      previousSourceSnapshotAt: null,
      provider: "dataforseo",
      scope: "root",
      sourceSnapshotAt: "2026-08-10T00:00:00.000Z",
      state: "ok",
      target: "example.com",
    });

    const response = await postDomainOverviewAnalyze(context("analyze", commonBody), "prj_1");

    await expect(response.json()).resolves.toMatchObject({
      data: {
        keywords: {
          data: {
            rows: [
              {
                cpc_cents: 42.5,
                rank_absolute_delta: -1,
                ranking_url: "https://example.com/",
                search_volume: 100,
                serp_features: ["organic"],
              },
            ],
          },
        },
        overview: {
          estimated_traffic_cost_cents: 250.5,
          pos1: 5,
          pos2_3: 6,
          pos4_10: 7,
          pos11_20: 8,
        },
        pages: {
          data: {
            cost_cents: 1.25,
            rows: [
              {
                etv_delta_pct: -2.5,
                keyword_count: 4,
                top_keyword: "example pricing",
                top_keyword_position: 3,
              },
            ],
          },
        },
      },
    });
  });

  it("serializes populated history rows", async () => {
    mocks.history.mockResolvedValue({
      ...moduleSuccess,
      data: [{ metrics, month: 7, year: 2026 }],
    });

    const response = await postDomainOverviewHistory(context("history", commonBody), "prj_1");

    await expect(response.json()).resolves.toMatchObject({
      data: {
        data: [
          {
            metrics: { pos1: 5, pos2_3: 6, pos4_10: 7, pos11_20: 8 },
            month: 7,
            year: 2026,
          },
        ],
      },
    });
  });

  it.each([
    ["analyze", postDomainOverviewAnalyze, commonBody],
    ["history", postDomainOverviewHistory, commonBody],
    ["keywords", postDomainOverviewKeywords, { ...commonBody, limit: 100, offset: 0 }],
    ["pages", postDomainOverviewPages, { ...commonBody, limit: 100, offset: 0 }],
  ] as const)(
    "rejects an unsupported target before the %s service call",
    async (action, handler, body) => {
      const response = await handler(context(action, { ...body, target: "localhost" }), "prj_1");

      expect(response).toBeDefined();
      if (!response) throw new Error("Expected an unsupported-target response");
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        errors: { cost_cents: 0, reason: "unsupported_target" },
        type: "https://bisibility.com/problems/unsupported_target",
      });
    },
  );

  it.each([
    ["no_source", 404, "not_found"],
    ["budget_exhausted", 429, "budget_exhausted"],
    ["cost_limit_exceeded", 422, "cost_limit_exceeded"],
    ["in_progress", 429, "lookup_in_progress"],
    ["rate_limited", 429, "rate_limited"],
    ["needs_reauth", 422, "provider_unavailable"],
    ["unsupported_location", 422, "unsupported_location"],
    ["snapshot_expired", 409, "snapshot_expired"],
    ["lookup_failed", 422, "provider_unavailable"],
  ] as const)("preserves charged %s failure details", async (reason, status, code) => {
    mocks.analyze.mockResolvedValue({
      costCents: 2.75,
      ok: false,
      reason,
      resetAt: Date.now() + 5_000,
    });

    const response = await postDomainOverviewAnalyze(context("analyze", commonBody), "prj_1");

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({
      errors: { cost_cents: 2.75, reason },
      type: `https://bisibility.com/problems/${code}`,
    });
    if (reason === "in_progress" || reason === "rate_limited") {
      expect(response.headers.get("retry-after")).toBeTruthy();
    }
  });
});
