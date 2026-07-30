import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { getKeywordResearch, postKeywordMetrics } from "./keyword-research";

const mocks = vi.hoisted(() => ({ metrics: vi.fn(), research: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/keyword-research/service", () => ({
  fetchKeywordMetrics: mocks.metrics,
  researchKeywords: mocks.research,
}));

const projectId = "prj_a00000000000000000000000";
const connectionId = "conn_a00000000000000000000000";

function context(method: "GET" | "POST", resource: string, search = "", body?: unknown) {
  const url = new URL(`https://example.com/api/v1/projects/${projectId}/${resource}${search}`);
  return {
    auth: { project: { id: "project_1", publicId: projectId } },
    headers: new Headers({ "RateLimit-Remaining": "99" }),
    instance: "urn:test",
    method,
    path: ["projects", projectId, resource],
    req: new Request(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      method,
    }),
    url,
  } as ApiContext;
}

const metric = {
  competition: 0.4,
  cpcCents: 123,
  difficulty: null,
  intent: null,
  monthlyTrend: [{ month: 6, searchVolume: 50, year: 2026 }],
  searchVolume: 100,
};

describe("keyword research REST handlers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serializes research query and response fields", async () => {
    mocks.research.mockResolvedValue({
      cached: false,
      connections: [{ id: connectionId, label: "DataForSEO", provider: "dataforseo" }],
      costCents: 2,
      fetchedAt: "2026-07-22T10:00:00.000Z",
      ok: true,
      provider: "DataForSEO",
      rows: [{ ...metric, alreadyTracked: true, keyword: "rank tracker", source: "related" }],
      sources: [{ cached: false, costCents: 2, returned: 1, source: "related", status: "ok" }],
    });
    const response = await getKeywordResearch(
      context(
        "GET",
        "keyword-research",
        `?seed=rank%20tracker&mode=related&result_limit=300&connection_id=${connectionId}&include_clickstream=true&fresh=true&estimate_only=true&max_cost_cents=7`,
      ),
      projectId,
    );
    await expect(response.json()).resolves.toMatchObject({
      connections: [{ id: connectionId }],
      cost_cents: 2,
      rows: [{ already_tracked: true, cpc_cents: 123, source: "related" }],
      total_count: 1,
    });
    expect(mocks.research).toHaveBeenCalledWith(
      expect.objectContaining({
        fresh: true,
        includeClickstream: true,
        connectionId,
        estimateOnly: true,
        maxCostCents: 7,
        mode: "related",
        resultLimit: 300,
        seed: "rank tracker",
      }),
    );
  });

  it("serializes metrics body and nullable metrics", async () => {
    mocks.metrics.mockResolvedValue({
      cachedCount: 1,
      connections: [],
      costCents: 1,
      fetchedAt: "2026-07-22T10:00:00.000Z",
      fetchedCount: 1,
      ok: true,
      provider: "DataForSEO",
      rows: [{ keyword: "rank tracker", ...metric }],
    });
    const response = await postKeywordMetrics(
      context("POST", "keyword-metrics", "", {
        connection_id: connectionId,
        fresh: true,
        include_clickstream: true,
        keywords: ["rank tracker"],
        estimate_only: true,
        max_cost_cents: 7,
      }),
      projectId,
    );
    await expect(response.json()).resolves.toMatchObject({
      cached_count: 1,
      fetched_count: 1,
      rows: [{ difficulty: null, intent: null, search_volume: 100 }],
    });
    expect(mocks.metrics).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId, estimateOnly: true, maxCostCents: 7 }),
    );
  });

  it.each(["connection_db_1", "key_a00000000000000000000000"])(
    "rejects connection ID %s before either service",
    async (invalidId) => {
      await expect(
        getKeywordResearch(
          context("GET", "keyword-research", `?seed=test&connection_id=${invalidId}`),
          projectId,
        ),
      ).rejects.toMatchObject({ code: "invalid_public_id" });
      await expect(
        postKeywordMetrics(
          context("POST", "keyword-metrics", "", {
            connection_id: invalidId,
            keywords: ["test"],
          }),
          projectId,
        ),
      ).rejects.toMatchObject({ code: "invalid_public_id" });
      expect(mocks.research).not.toHaveBeenCalled();
      expect(mocks.metrics).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no_source", 404],
    ["budget_exhausted", 429],
    ["rate_limited", 429],
    ["unsupported_location", 422],
    ["needs_reauth", 422],
    ["cost_limit_exceeded", 422],
    ["in_progress", 429],
  ] as const)("maps %s to %i with problem and rate headers", async (reason, status) => {
    mocks.research.mockResolvedValue({ ok: false, reason, resetAt: Date.now() + 5_000 });
    const response = await getKeywordResearch(
      context("GET", "keyword-research", "?seed=test"),
      projectId,
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(response.headers.get("ratelimit-remaining")).toBe("99");
    if (reason === "rate_limited" || reason === "in_progress")
      expect(response.headers.get("retry-after")).toBeTruthy();
  });

  it.each(["?seed=", "?seed=x&mode=bad", "?seed=x&result_limit=200"])(
    "rejects invalid research query %s",
    async (search) => {
      await expect(
        getKeywordResearch(context("GET", "keyword-research", search), projectId),
      ).rejects.toThrow();
    },
  );

  it("rejects empty and oversized metrics batches", async () => {
    await expect(
      postKeywordMetrics(context("POST", "keyword-metrics", "", { keywords: [] }), projectId),
    ).rejects.toThrow();
    await expect(
      postKeywordMetrics(
        context("POST", "keyword-metrics", "", { keywords: Array(701).fill("keyword") }),
        projectId,
      ),
    ).rejects.toThrow();
  });
});
