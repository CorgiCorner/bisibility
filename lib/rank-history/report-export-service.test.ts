import { createReportCursorCodec } from "@/lib/rank-reports/cursor";
import { reportAsOf, reportPolicy, reportProject } from "@/lib/rank-reports/report-test-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareRankHistoryExport } from "./report-export-service";
import { historyExportSnapshotFixture } from "./report-export-test-fixture";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./export-snapshot", () => ({ loadHistoryExportSnapshot: mocks.snapshot }));
const context = { actor: { id: "viewer" }, transport: "session" as const };
const options = {
  codec: createReportCursorCodec("synthetic-history-export-cursor-key-only"),
  firstAsOf: reportAsOf,
  reportAt: (asOf: Date) => ({
    asOf,
    limits: { maxChecks: 1000, maxTargets: 1000, maxItems: 1000 },
    policyAt: () => reportPolicy(),
    loadMetadata: async () => new Map(),
  }),
};

describe("actual history export preparation contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshot.mockImplementation(async () => historyExportSnapshotFixture());
  });
  it("preserves legacy raw position, previous position and historical URL without today's substitution", async () => {
    const result = await prepareRankHistoryExport(
      context,
      { range: "all" },
      reportProject.publicId,
      options,
    );
    expect(result.legacyRows).toMatchObject([
      { position: 4, previousPosition: 9, rankingUrl: "https://example.test/old" },
    ]);
    expect(result.legacyRows[0].keyword).toBe("=literal keyword");
    expect(result.meta.summary.metric.value).toBeNull();
    expect(result.meta.resolutions[0].currentScopeState).toBe("unavailable");
  });
  it("separates attempts from observations, preserves unknown freshness and does not invent absence", async () => {
    const attempts = await prepareRankHistoryExport(
      context,
      { version: "2", range: "all", stream: "attempts" },
      reportProject.publicId,
      options,
    );
    const observations = await prepareRankHistoryExport(
      context,
      { version: "2", range: "all" },
      reportProject.publicId,
      options,
    );
    expect(attempts.reportRows).toHaveLength(2);
    expect(observations.reportRows).toHaveLength(1);
    expect(attempts.reportRows).toContainEqual(
      expect.objectContaining({ status: "failed", errorCode: "provider_failed" }),
    );
    expect(observations.reportRows[0]).toMatchObject({
      recordedAt: "2026-10-12T10:01:00.000Z",
      observedAt: "2026-10-12T10:00:00.000Z",
    });
    expect(observations.meta.summary).toEqual(attempts.meta.summary);
  });
  it("rejects unsigned legacy cursors in explicit V2 before any read", async () => {
    await expect(
      prepareRankHistoryExport(
        context,
        {
          version: "2",
          cursor: Buffer.from(JSON.stringify({ v: 3, o: 50 })).toString("base64url"),
        },
        reportProject.publicId,
        options,
      ),
    ).rejects.toMatchObject({ code: "invalid_rank_report_cursor" });
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("retains genuine V3 offset cursors for default V1 and refreshes its authorized bounded source", async () => {
    const original = historyExportSnapshotFixture();
    const check = original.targets[0].checks[0];
    const snapshot = {
      ...original,
      targets: [
        {
          ...original.targets[0],
          checks: [
            ...original.targets[0].checks,
            {
              ...check,
              id: "check_cbcdefghijklmnopqrstuvwx",
              checkedAt: new Date(check.checkedAt.getTime() - 1000),
            },
          ],
        },
      ],
    };
    mocks.snapshot.mockResolvedValue(snapshot);
    const first = await prepareRankHistoryExport(
      context,
      { range: "all", limit: 1 },
      reportProject.publicId,
      options,
    );
    expect(JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString())).toEqual({
      v: 3,
      o: 1,
    });
    const newerAsOf = new Date(reportAsOf.getTime() + 1000);
    mocks.snapshot.mockResolvedValue({
      ...snapshot,
      asOf: newerAsOf.toISOString(),
      sourceDigest: "a".repeat(64),
    });
    const second = await prepareRankHistoryExport(
      context,
      { range: "all", limit: 1, cursor: first.nextCursor },
      reportProject.publicId,
      { ...options, firstAsOf: newerAsOf },
    );
    expect(second.legacyPage).toHaveLength(1);
    expect(second.legacyPage[0].id).not.toBe(first.legacyPage[0].id);
    expect(second.nextCursor).toBeNull();
    expect(mocks.snapshot).toHaveBeenCalledTimes(2);
    expect(second.meta.asOf).toBe(newerAsOf.toISOString());
  });
  it("keeps V1 daily raw checks and latest-per-Jan1-UTC-seven-day-bucket weekly policy", async () => {
    const original = historyExportSnapshotFixture();
    const check = original.targets[0].checks[0];
    const checks = [1, 3, 8].map((day, index) => ({
      ...check,
      id: `check_${["d", "e", "f"][index]}bcdefghijklmnopqrstuvwx`,
      checkedAt: new Date(`2026-01-${String(day).padStart(2, "0")}T10:00:00Z`),
    }));
    mocks.snapshot.mockResolvedValue({
      ...original,
      targets: [{ ...original.targets[0], checks }],
    });
    const daily = await prepareRankHistoryExport(
      context,
      { range: "all" },
      reportProject.publicId,
      options,
    );
    const weekly = await prepareRankHistoryExport(
      context,
      { range: "all", granularity: "weekly" },
      reportProject.publicId,
      options,
    );
    expect(daily.legacyRows.map((row) => row.checkedAt.getUTCDate())).toEqual([8, 3, 1]);
    expect(weekly.legacyRows.map((row) => row.checkedAt.getUTCDate())).toEqual([8, 3]);
  });
  it("rejects malformed V1 and signed V2 tokens in V1 instead of silently restarting", async () => {
    for (const cursor of [
      "not-a-cursor",
      Buffer.from(JSON.stringify({ v: 3, o: -1 })).toString("base64url"),
      options.codec.encode({
        version: 1,
        asOf: reportAsOf.toISOString(),
        binding: "a".repeat(64),
        source: "b".repeat(64),
        last: { at: reportAsOf.toISOString(), id: "check_abcdefghijklmnopqrstuvwx" },
      }),
    ]) {
      await expect(
        prepareRankHistoryExport(context, { cursor }, reportProject.publicId, options),
      ).rejects.toMatchObject({ code: "invalid_rank_report_cursor" });
    }
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("uses original asOf and rejects changed recorded source, foreign actor or scope on continuation", async () => {
    const first = await prepareRankHistoryExport(
      context,
      { version: "2", range: "all", stream: "attempts", limit: 1 },
      reportProject.publicId,
      options,
    );
    expect(first.nextCursor).toBeTruthy();
    const next = await prepareRankHistoryExport(
      context,
      { version: "2", range: "all", stream: "attempts", limit: 1, cursor: first.nextCursor },
      reportProject.publicId,
      options,
    );
    expect(next.reportPage).toHaveLength(1);
    expect(next.meta.summary).toEqual(first.meta.summary);
    await expect(
      prepareRankHistoryExport(
        { ...context, actor: { id: "other" } },
        { version: "2", range: "all", stream: "attempts", limit: 1, cursor: first.nextCursor },
        reportProject.publicId,
        options,
      ),
    ).rejects.toMatchObject({ code: "invalid_rank_report_cursor" });
    mocks.snapshot.mockImplementation(async () => ({
      ...historyExportSnapshotFixture(),
      sourceDigest: "a".repeat(64),
    }));
    await expect(
      prepareRankHistoryExport(
        context,
        { version: "2", range: "all", stream: "attempts", limit: 1, cursor: first.nextCursor },
        reportProject.publicId,
        options,
      ),
    ).rejects.toMatchObject({ code: "rank_report_snapshot_changed" });
  });
  it("refuses CSV continuation instead of returning a successful partial file", async () => {
    await expect(
      prepareRankHistoryExport(
        context,
        { format: "csv", cursor: "anything" },
        reportProject.publicId,
        options,
      ),
    ).rejects.toThrow();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
