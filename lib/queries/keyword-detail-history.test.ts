import { historyPages } from "@/components/keyword-detail-history/history.test-fixture";
import type { Prisma } from "@/lib/generated/prisma/client";
import { detailTarget } from "@/lib/keyword-detail/quality-test-fixture";
import type { RankReportContext } from "@/lib/rank-reports/access";
import {
  reportAsOf,
  reportKeyword,
  reportPolicy,
  reportProject,
} from "@/lib/rank-reports/report-test-fixture";
import type {
  RankReportReadOptions,
  RankReportSnapshotProjection,
} from "@/lib/rank-reports/service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadKeywordDetailHistoryWindow,
  loadKeywordHistoryWindow,
  refreshKeywordHistoryWindow,
} from "./keyword-detail-history";
import { rankTrackerQualityFixture } from "./rank-tracker-report-test-fixture";

const mocks = vi.hoisted(() => ({ factory: vi.fn(), reader: vi.fn(), pages: vi.fn(), codec: {} }));
vi.mock("server-only", () => ({}));
vi.mock("./rank-tracker-session-report", () => ({
  createSessionRankTrackerReportOptions: mocks.factory,
}));
vi.mock("@/lib/rank-reports/host-cursor", () => ({ hostRankReportCursorCodec: () => mocks.codec }));
vi.mock("@/lib/rank-reports/history-snapshot", () => ({ readRetainedHistorySnapshotFor: vi.fn() }));
vi.mock("@/lib/rank-reports/service", () => ({
  readRankReportFor: vi.fn(),
  readRankReportPagesFor: mocks.pages,
  readRankReportPagesWithProjectionFor: mocks.reader,
}));

describe("keyword detail trusted paired loader wiring", () => {
  const window = {
    basis: "observed_at" as const,
    from: "2026-09-01T00:00:00.000Z",
    to: reportAsOf.toISOString(),
  };
  const scope = {
    projectId: reportProject.publicId,
    keywordId: reportKeyword,
    windows: [{ id: "current-window", window }],
  };
  const actor = { actor: { id: "verified-session-user" }, transport: "session" as const };
  const row = () => ({
    ...rankTrackerQualityFixture().row,
    bestPosition: 99,
    position: 99,
    metadataOnly: "preserved",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.factory.mockResolvedValue({
      asOf: reportAsOf,
      context: actor,
      limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 1 },
      policyAt: () => reportPolicy(),
      loadMetadata: vi.fn(async () => new Map()),
    });
    mocks.reader.mockImplementation(
      async (
        _context: RankReportContext,
        inputs: Array<{ stream: string }>,
        _options: RankReportReadOptions,
        project: (snapshot: RankReportSnapshotProjection) => unknown,
      ) => {
        await _options.loadMetadata(
          {} as Prisma.TransactionClient,
          {
            actor: actor.actor,
            keywords: [
              { id: "keyword-db", publicId: reportKeyword, createdAt: new Date("2026-01-01") },
            ],
            project: reportProject,
          },
          reportAsOf,
        );
        const pages = historyPages();
        const envelopes = [pages.observations, pages.attempts].map((page, index) => ({
          ...page,
          asOf: reportAsOf.toISOString(),
          stream: inputs[index].stream,
          sourceDigest: "actual-paired-source",
        }));
        return {
          pages: envelopes,
          projection: project({
            policy: reportPolicy(),
            project: reportProject,
            sourceDigest: "actual-paired-source",
            targets: [detailTarget()],
          }),
        };
      },
    );
  });

  it("keeps refresh and registered-window reads at the same header watermark despite a later clock", async () => {
    mocks.pages.mockResolvedValue([historyPages().observations, historyPages().attempts]);
    vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
    try {
      await loadKeywordHistoryWindow(scope, window);
      await refreshKeywordHistoryWindow(scope, window);
      expect(mocks.factory).toHaveBeenNthCalledWith(1, new Date(window.to));
      expect(mocks.factory).toHaveBeenNthCalledWith(2, new Date(window.to));
      expect(mocks.pages).toHaveBeenCalledTimes(2);
      expect(mocks.pages.mock.calls[0][0]).toBe(actor);
    } finally {
      vi.setSystemTime(reportAsOf);
    }
  });

  it("forwards verified identity, one selected ID, explicit read budgets and the synchronous real projector", async () => {
    const result = await loadKeywordDetailHistoryWindow(scope, window, row());
    expect(mocks.factory).toHaveBeenCalledWith(new Date(window.to));
    expect(mocks.reader).toHaveBeenCalledOnce();
    const [context, inputs, options] = mocks.reader.mock.calls[0];
    expect(context).toBe(actor);
    expect(inputs).toEqual([
      {
        projectId: scope.projectId,
        selectedIds: [reportKeyword],
        pageLimit: 100,
        stream: "observations",
        window,
      },
      {
        projectId: scope.projectId,
        selectedIds: [reportKeyword],
        pageLimit: 100,
        stream: "attempts",
        window: { ...window, basis: "recorded_at" },
      },
    ]);
    expect(options).toMatchObject({
      cursor: mocks.codec,
      firstAsOf: reportAsOf,
      limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 1 },
    });
    expect(result.keyword).toMatchObject({
      metadataOnly: "preserved",
      position: 6,
      bestPosition: 6,
      cpcKnown: false,
      difficultyKnown: false,
      volumeKnown: false,
      serpFeatures: [],
    });
    expect(result.quality.sourceDigest).toBe(result.history.observations.sourceDigest);
    expect(result.quality.asOf).toBe(result.history.attempts.asOf);
  });

  it("uses captured metadata from the first report read and never the legacy raw-backed metrics", async () => {
    const loadMetadata = vi.fn(
      async () =>
        new Map([
          [
            reportKeyword,
            {
              expectedScope: detailTarget().expectedScope,
              volume: 12,
              metrics: { cpc: 1.23, difficulty: 4, serpFeatures: ["captured-feature"], volume: 12 },
            },
          ],
        ]),
    );
    const source = await mocks.factory();
    mocks.factory.mockResolvedValueOnce({ ...source, loadMetadata });
    const result = await loadKeywordDetailHistoryWindow(scope, window, {
      ...row(),
      cpc: "99.99",
      volume: 999,
      difficulty: 99,
      serpFeatures: ["obsolete-raw-feature"],
    });
    expect(result.keyword).toMatchObject({
      cpc: "1.23",
      cpcKnown: true,
      difficulty: 4,
      difficultyKnown: true,
      volume: 12,
      volumeKnown: true,
      serpFeatures: ["captured-feature"],
    });
    expect(loadMetadata).toHaveBeenCalledOnce();
  });

  it("refuses an arbitrary window and row/selection mismatch before loading a session or history", async () => {
    await expect(
      loadKeywordDetailHistoryWindow(scope, { ...window, from: "2000-01-01T00:00:00.000Z" }, row()),
    ).rejects.toThrow();
    await expect(
      loadKeywordDetailHistoryWindow(scope, window, { ...row(), id: "kw_foreign" }),
    ).rejects.toThrow();
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.reader).not.toHaveBeenCalled();
  });

  it("does not manufacture session authority when the trusted server factory has no verified context", async () => {
    mocks.factory.mockResolvedValueOnce({ asOf: reportAsOf, context: undefined });
    await expect(loadKeywordDetailHistoryWindow(scope, window, row())).rejects.toThrow();
    expect(mocks.reader).not.toHaveBeenCalled();
  });
});
