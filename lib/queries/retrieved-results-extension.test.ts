import { expect, it, vi } from "vitest";
import { loadRetrievedResultsForChecks } from "./retrieved-results";

const mocks = vi.hoisted(() => ({ find: vi.fn(), view: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { rankCheck: { findMany: mocks.find } } }));
vi.mock("@/lib/rank-check/raw-retention", () => ({ getRankCheckRawRetentionDays: () => null }));
vi.mock("@/lib/serp/snapshot-extension-view", () => ({ loadSnapshotExtensionView: mocks.view }));

it("awaits the project-scoped extension proof without reordering mixed retained tiers", async () => {
  const base = {
    checkedAt: new Date("2026-10-21T16:22:00Z"),
    organicRanks: null,
    position: 1,
    provider: "serpapi",
    rankingUrl: "https://example.com",
    requestedDepth: 10,
  };
  const raw = { organic_results: [{ rank: 1, domain: "example.com" }] };
  mocks.find.mockResolvedValue([
    { ...base, publicId: "full", raw },
    { ...base, publicId: "none", raw: null },
    {
      ...base,
      publicId: "compact",
      raw: null,
      organicRanks: [{ domain: "example.com", position: 1 }],
    },
  ]);
  const extension = {
    reason: "not_sent",
    nextStart: 10,
    expiresAt: "2026-10-21T16:37:00Z",
    pages: [],
  };
  mocks.view.mockImplementation(async () => {
    await Promise.resolve();
    return extension;
  });
  const results = await loadRetrievedResultsForChecks({
    projectId: "project",
    checkIds: ["full", "none", "compact"],
  });
  expect(results.map((result) => [result.checkId, result.tier])).toEqual([
    ["full", "full"],
    ["none", "none"],
    ["compact", "compact"],
  ]);
  expect(results[0]).toMatchObject({ extension });
  expect(mocks.view).toHaveBeenCalledExactlyOnceWith({
    projectId: "project",
    checkId: "full",
    provider: "serpapi",
    raw,
  });
  expect(mocks.find).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      where: {
        publicId: { in: ["full", "none", "compact"] },
        keyword: { projectId: "project" },
        status: "completed",
      },
    }),
  );
});
