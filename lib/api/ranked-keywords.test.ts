import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";
import { listRankedKeywordSuggestions } from "./ranked-keywords";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ranked-keywords/service", () => ({ fetchRankedKeywords: mocks.fetch }));

const projectId = "prj_a00000000000000000000000";
const connectionId = "conn_a00000000000000000000000";

function context(search = "") {
  const url = new URL(`https://example.com/api/v1/projects/${projectId}/ranked-keywords${search}`);
  return {
    auth: { project: { id: "project_1", publicId: projectId } },
    headers: new Headers({ "RateLimit-Remaining": "99" }),
    instance: "urn:test",
    method: "GET",
    path: ["projects", projectId, "ranked-keyword-suggestions"],
    req: new Request(url),
    url,
  } as ApiContext;
}

describe("ranked-keyword REST endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serializes query params and the snake-case response", async () => {
    mocks.fetch.mockResolvedValue({
      cached: false,
      connections: [{ id: connectionId, label: "DataForSEO", provider: "dataforseo" }],
      costCents: 2,
      fetchedAt: "2026-07-22T10:00:00.000Z",
      offset: 100,
      ok: true,
      rows: [
        {
          alreadyTracked: true,
          estimatedTraffic: 4.2,
          keyword: "rank tracker",
          position: 3,
          searchVolume: 100,
        },
      ],
      totalCount: 201,
    });
    const response = await listRankedKeywordSuggestions(
      context(`?connection_id=${connectionId}&offset=100&limit=100&fresh=true`),
      projectId,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cached: false,
      connections: [{ id: connectionId }],
      rows: [{ already_tracked: true, estimated_traffic: 4.2, search_volume: 100 }],
      total_count: 201,
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId, fresh: true, offset: 100 }),
    );
  });

  it.each(["connection_db_1", "key_a00000000000000000000000"])(
    "rejects connection ID %s before the service",
    async (invalidId) => {
      await expect(
        listRankedKeywordSuggestions(context(`?connection_id=${invalidId}`), projectId),
      ).rejects.toMatchObject({ code: "invalid_public_id" });
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no_source", 404],
    ["no_domain", 422],
    ["budget_exhausted", 429],
    ["rate_limited", 429],
    ["unsupported_location", 422],
    ["needs_reauth", 422],
  ] as const)("maps %s to %i", async (reason, status) => {
    mocks.fetch.mockResolvedValue({ ok: false, reason, resetAt: Date.now() + 5_000 });
    const response = await listRankedKeywordSuggestions(context(), projectId);
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    if (reason === "rate_limited") expect(response.headers.get("retry-after")).toBeTruthy();
  });

  it.each(["?offset=50", "?offset=1000", "?limit=101", "?fresh=yes"])(
    "rejects invalid query %s",
    async (search) => {
      await expect(listRankedKeywordSuggestions(context(search), projectId)).rejects.toThrow();
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
});
