import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadRetrievedResultsForChecks,
  storedResultsIndex,
  storedResultsSummaries,
} from "./retrieved-results";

const mocks = vi.hoisted(() => ({ query: vi.fn(), find: vi.fn(), extension: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $queryRaw: mocks.query, rankCheck: { findMany: mocks.find } },
}));
vi.mock("@/lib/rank-check/raw-retention", () => ({ getRankCheckRawRetentionDays: () => null }));
vi.mock("@/lib/serp/snapshot-extension-view", () => ({
  loadSnapshotExtensionView: mocks.extension,
}));

const base = {
  checkId: "check",
  publicId: "check",
  checkedAt: new Date("2026-10-21T16:00:00Z"),
  requestedDepth: 20,
  position: 2,
  provider: "serpapi",
  rankingUrl: "https://example.com",
  organicRanks: null,
  tier: "full",
  retrieved: 9,
};
const raw = {
  normalization: { outcome: "match" },
  organic_results: [
    { rank: 2, domain: "example.com" },
    { rank: 9, domain: "other.test" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.extension.mockResolvedValue({ reason: "expired", pages: [] });
});

describe("retained SERP stop provenance", () => {
  it.each([
    ["complete", false],
    ["truncated_by_stop_on_match", true],
    ["unknown", false],
    [null, false],
  ] as const)(
    "uses captured %s completeness for full detail, never a matched short snapshot",
    async (completeness, expected) => {
      mocks.find.mockResolvedValue([
        {
          ...base,
          raw,
          observationRun: completeness === null ? null : { projectId: "project", completeness },
        },
      ]);
      const [result] = await loadRetrievedResultsForChecks({
        projectId: "project",
        checkIds: ["check"],
      });
      expect(result).toMatchObject({
        tier: "full",
        retrievedPositions: 9,
        stoppedAtResult: expected,
      });
      expect(mocks.find.mock.calls[0][0].select.observationRun).toEqual({
        select: { completeness: true, projectId: true },
      });
    },
  );

  it.each(["index", "summary"] as const)(
    "preserves unknown legacy provenance in the %s and scopes its observation join",
    async (kind) => {
      mocks.query.mockResolvedValue(
        ["complete", "truncated_by_stop_on_match", "unknown", null].map((completeness, index) => ({
          ...base,
          checkId: `check${index}`,
          observationCompleteness: completeness,
        })),
      );
      const rows =
        kind === "index"
          ? await storedResultsIndex({ projectId: "project", keywordPublicId: "keyword" })
          : [
              ...(
                await storedResultsSummaries({
                  projectId: "project",
                  checkIds: ["check0", "check1", "check2", "check3"],
                })
              ).values(),
            ];
      expect(rows.map((row) => row.stoppedAtResult)).toEqual([false, true, null, null]);
      const sql = mocks.query.mock.calls[0][0].sql as string;
      expect(sql).toContain('LEFT JOIN "observation_runs"');
      expect(sql).toContain('ob."rankCheckId" = rc."id"');
      expect(sql).toContain('ob."projectId" = k."projectId"');
      expect(sql).not.toContain("'normalization'->>'outcome'");
    },
  );

  it("keeps original stop provenance separate from results appended after the check", async () => {
    const extension = {
      reason: "available",
      pages: [{ completeness: "unknown", rows: [{ position: 20, domain: "later.test" }] }],
      nextStart: 20,
    };
    mocks.extension.mockResolvedValue(extension);
    mocks.find.mockResolvedValue([
      {
        ...base,
        raw: { ...raw, snapshotExtension: extension },
        observationRun: { projectId: "project", completeness: "truncated_by_stop_on_match" },
      },
    ]);
    const [result] = await loadRetrievedResultsForChecks({
      projectId: "project",
      checkIds: ["check"],
    });
    expect(result).toMatchObject({ stoppedAtResult: true, retrievedPositions: 9, extension });
    if (result.tier === "full") expect(result.rows.map((row) => row.position)).toEqual([2, 9]);
  });

  it("keeps a matched full-depth response unmarked when collection completed", async () => {
    mocks.find.mockResolvedValue([
      {
        ...base,
        raw: {
          ...raw,
          organic_results: [...raw.organic_results, { rank: 20, domain: "end.test" }],
        },
        observationRun: { projectId: "project", completeness: "complete" },
      },
    ]);
    const [result] = await loadRetrievedResultsForChecks({
      projectId: "project",
      checkIds: ["check"],
    });
    expect(result).toMatchObject({ retrievedPositions: 20, stoppedAtResult: false });
  });

  it("does not upgrade unknown original provenance using a later extension page", async () => {
    mocks.extension.mockResolvedValue({
      reason: "complete",
      pages: [{ completeness: "complete", rows: [{ position: 20 }] }],
    });
    mocks.find.mockResolvedValue([
      { ...base, raw, observationRun: { projectId: "project", completeness: "unknown" } },
    ]);
    const [result] = await loadRetrievedResultsForChecks({
      projectId: "project",
      checkIds: ["check"],
    });
    expect(result).toMatchObject({ stoppedAtResult: false, retrievedPositions: 9 });
  });

  it("does not borrow completeness from a foreign project observation", async () => {
    mocks.find.mockResolvedValue([
      {
        ...base,
        raw,
        observationRun: { projectId: "other", completeness: "truncated_by_stop_on_match" },
      },
    ]);
    const [result] = await loadRetrievedResultsForChecks({
      projectId: "project",
      checkIds: ["check"],
    });
    expect(result).toMatchObject({ stoppedAtResult: false });
  });
});
