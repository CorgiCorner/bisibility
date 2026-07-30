import { UnsupportedBacklinksTargetError } from "@/lib/backlinks/target";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBacklinks, postBacklinkRows } from "./backlinks";
import type { ApiContext } from "./context";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  loadMore: vi.fn(),
  SnapshotExpiredError: class BacklinksSnapshotExpiredError extends Error {
    readonly code = "snapshot_expired";

    constructor() {
      super("No unexpired backlinks snapshot exists.");
    }
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/backlinks/service", () => ({
  analyzeBacklinks: mocks.analyze,
  BacklinksSnapshotExpiredError: mocks.SnapshotExpiredError,
  loadMoreBacklinkRows: mocks.loadMore,
}));

const snapshot = {
  cached: false,
  cachedUntil: "2026-07-25T15:00:00.000Z",
  costCents: 5,
  fetchedAt: "2026-07-24T15:00:00.000Z",
  fetchedRowCount: 1,
  history: [{ lostLinks: 8, month: "2026-06", newLinks: 22 }],
  includeSubdomains: true,
  ok: true as const,
  provider: "dataforseo",
  rows: [
    {
      anchor: "Acme",
      domainAuthority: 91,
      firstSeen: "2026-01-21",
      flags: ["ugc" as const],
      linksCount: 2,
      lostAt: null,
      sourceDomain: "forum.example.org",
      sourceUrl: "https://forum.example.org/post",
      spamScore: 1,
      status: "active" as const,
      targetUrl: "https://acme-store.com/",
    },
  ],
  summary: {
    backlinksTotal: 1685,
    brokenBacklinks: 0,
    brokenPages: 0,
    dofollowPct: 61,
    domainRank: 37,
    lostBacklinks: 12,
    lostReferringDomains: 1,
    newBacklinks: 34,
    newReferringDomains: 3,
    referringDomainsTotal: 48,
    referringPages: 1422,
    spamScore: 3,
  },
  target: "acme-store.com",
  targetScope: "site" as const,
  totalRowsAvailable: 1685,
};

function context(method: "GET" | "POST", search = "", body?: unknown) {
  const suffix = method === "GET" ? `/backlinks${search}` : "/backlinks/rows";
  const url = new URL(`https://example.test/api/v1/projects/prj_1${suffix}`);
  return {
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: "prj_1" } },
    headers: new Headers({ "RateLimit-Remaining": "99" }),
    instance: "urn:test",
    method,
    path:
      method === "GET"
        ? ["projects", "prj_1", "backlinks"]
        : ["projects", "prj_1", "backlinks", "rows"],
    req: new Request(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      method,
    }),
    url,
  } as ApiContext;
}

describe("backlinks REST handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.analyze.mockResolvedValue(snapshot);
    mocks.loadMore.mockResolvedValue(snapshot);
  });

  it("parses the analyze query and returns the service snapshot in the data envelope", async () => {
    const response = await getBacklinks(
      context(
        "GET",
        "?target=acme-store.com&target_scope=site&include_subdomains=false&result_limit=1000&mode=one_per_domain&estimate_only=true&fresh=true&max_cost_cents=9",
      ),
      "prj_1",
    );

    expect(mocks.analyze).toHaveBeenCalledWith(
      { actorId: "user_1", projectId: "project_1" },
      {
        estimateOnly: true,
        fresh: true,
        includeSubdomains: false,
        maxCostCents: 9,
        mode: "one_per_domain",
        resultLimit: 1000,
        target: "acme-store.com",
        targetScope: "site",
      },
    );
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        cached_until: snapshot.cachedUntil,
        cost_cents: 5,
        fetched_row_count: 1,
        rows: [expect.objectContaining({ domain_authority: 91 })],
        target_scope: "site",
        total_rows_available: 1685,
      }),
    });
  });

  it("applies every analyze default", async () => {
    await getBacklinks(context("GET", "?target=acme-store.com"), "prj_1");

    expect(mocks.analyze).toHaveBeenCalledWith(
      { actorId: "user_1", projectId: "project_1" },
      {
        estimateOnly: false,
        fresh: false,
        includeSubdomains: true,
        maxCostCents: undefined,
        mode: "as_is",
        resultLimit: 100,
        target: "acme-store.com",
        targetScope: "site",
      },
    );
  });

  it.each([
    ["no_source", "not_found", 404],
    ["budget_exhausted", "budget_exhausted", 429],
    ["cost_limit_exceeded", "cost_limit_exceeded", 422],
    ["in_progress", "lookup_in_progress", 429],
    ["rate_limited", "rate_limited", 429],
    ["needs_reauth", "provider_unavailable", 422],
  ] as const)("maps %s to the %s problem", async (reason, code, status) => {
    mocks.analyze.mockResolvedValue({ ok: false, reason, resetAt: Date.now() + 5_000 });

    const response = await getBacklinks(context("GET", "?target=acme-store.com"), "prj_1");

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({
      status,
      type: `https://bisibility.com/problems/${code}`,
    });
    if (reason === "in_progress" || reason === "rate_limited") {
      expect(response.headers.get("retry-after")).toBeTruthy();
    }
  });

  it("maps local target validation to unsupported_target", async () => {
    mocks.analyze.mockRejectedValue(new UnsupportedBacklinksTargetError("Invalid target."));

    const response = await getBacklinks(context("GET", "?target=localhost"), "prj_1");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Invalid target.",
      type: "https://bisibility.com/problems/unsupported_target",
    });
  });

  it("parses load-more JSON and returns only the service result", async () => {
    const response = await postBacklinkRows(
      context("POST", "", {
        include_subdomains: true,
        limit: 300,
        target: "acme-store.com",
        target_scope: "site",
      }),
      "prj_1",
    );

    expect(mocks.loadMore).toHaveBeenCalledWith(
      { actorId: "user_1", projectId: "project_1" },
      {
        includeSubdomains: true,
        limit: 300,
        target: "acme-store.com",
        targetScope: "site",
      },
    );
    await expect(response.json()).resolves.toMatchObject({
      data: { fetched_row_count: 1, rows: [{ source_domain: "forum.example.org" }] },
    });
  });

  it("maps an expired load-more snapshot to snapshot_expired", async () => {
    mocks.loadMore.mockRejectedValue(new mocks.SnapshotExpiredError());

    const response = await postBacklinkRows(
      context("POST", "", {
        include_subdomains: true,
        limit: 100,
        target: "acme-store.com",
        target_scope: "site",
      }),
      "prj_1",
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      type: "https://bisibility.com/problems/snapshot_expired",
    });
  });
});
