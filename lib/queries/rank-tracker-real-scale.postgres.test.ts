import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getRankTrackerGroupedList } from "./rank-tracker-grouped-list";
import { getRankTrackerKeywordList } from "./rank-tracker-list";
import { realScaleFixture } from "./rank-tracker-real-scale.postgres.test-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn(async () => ({})) }));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)("real whole-scope scale", () => {
  let f: Awaited<ReturnType<typeof realScaleFixture>>;
  beforeAll(async () => {
    f = await realScaleFixture();
  }, 120_000);
  afterAll(async () => {
    await f?.close();
  });

  it("keeps 120 targets, 60 pairs and 11 improvements on every flat/grouped page", async () => {
    const options = f.options();
    const input = {
      projectRef: f.project.publicId,
      query: {
        ...defaultRankTrackerQueryState,
        pageSize: 50 as const,
      },
    };
    const first = await getRankTrackerKeywordList(input, options);
    for (const page of [2, 3]) {
      const next = await getRankTrackerKeywordList(
        { ...input, query: { ...input.query, page } },
        options,
      );
      expect(next.report).toEqual(first.report);
      expect(next.selectedKeywordIds).toEqual(first.selectedKeywordIds);
      expect(next.rows).toHaveLength(page === 3 ? 20 : 50);
    }
    const grouped = await getRankTrackerGroupedList(
      { ...input, query: { ...input.query, grouped: true, page: 3 } },
      options,
    );
    expect(grouped.report).toEqual(first.report);
    expect(grouped.groups).toHaveLength(20);
    expect(first.report?.metric.counts).toMatchObject({
      expected: 120,
      comparable: 60,
      ranked: 120,
    });
    expect(first.report?.metric.freshness).toBe("unknown");
    const up = await getRankTrackerKeywordList(
      { ...input, query: { ...input.query, filters: { ...input.query.filters, change: "up" } } },
      options,
    );
    expect(up.matchedTargetCount).toBe(11);
    expect(up.rows.map(({ id }) => id).sort()).toEqual(
      f.keywords
        .slice(0, 11)
        .map(({ publicId }) => publicId)
        .sort(),
    );
    expect(up.rows.every((row) => row.position === 2 && row.positionBaseline === 3)).toBe(true);
    expect(up.report?.metric.counts.comparable).toBe(11);
  });

  it("reads 2001 targets in bounded metadata batches, preserves unmeasured state and refuses a smaller cap", async () => {
    const query = { ...defaultRankTrackerQueryState, pageSize: 50 as const };
    f.resetReads();
    await getRankTrackerKeywordList({ projectRef: f.project.publicId, query }, f.options());
    const small = f.readings();
    await f.expand();
    f.resetReads();
    const result = await getRankTrackerKeywordList(
      { projectRef: f.project.publicId, query },
      f.options(),
    );
    const large = f.readings();
    expect(result.rows).toHaveLength(50);
    expect(result.selectedKeywordIds).toHaveLength(2001);
    expect(result.report?.metric.counts).toMatchObject({
      expected: 2001,
      comparable: 60,
      neverChecked: 1881,
    });
    expect(large.metadataBatches).toEqual([500, 500, 500, 500, 1]);
    // Four extra authority batches may add a fixed number of statements, not 1881 reads.
    expect(large.queries - small.queries).toBeLessThanOrEqual(40);
    const options = f.options();
    await expect(
      getRankTrackerKeywordList(
        { projectRef: f.project.publicId, query },
        {
          ...options,
          limits: { ...options.limits, maxTargets: 2000 },
        },
      ),
    ).rejects.toMatchObject({ status: 413 });
    console.info(
      JSON.stringify({
        type: "whole-scope-scale",
        small,
        large,
        rowBytes: Buffer.byteLength(JSON.stringify(result.rows)),
        reportBytes: Buffer.byteLength(JSON.stringify(result.report)),
        scope:
          "bounded server materialization; report detail arrays are not a compact UI payload proof",
      }),
    );
  });
});
