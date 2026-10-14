import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { historyExportSnapshotFixture } from "@/lib/rank-history/report-export-test-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportKeywords } from "./keyword-export-action";

const PROJECT_ID = "prj_abcdefghijklmnopqrstuvwx";
const KEYWORD_IDS = ["kw_abcdefghijklmnopqrstuvwx", "kw_bbcdefghijklmnopqrstuvwx"];
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  audit: vi.fn(),
  snapshot: vi.fn(),
  report: vi.fn(),
  limits: vi.fn(),
  legacyResolve: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/rank-tracker-selection", () => ({
  resolveAuthorizedRankTrackerExportKeywordIds: mocks.legacyResolve,
}));
vi.mock("@/lib/rank-history/export-snapshot", () => ({
  loadHistoryExportSnapshot: mocks.snapshot,
}));
vi.mock("@/lib/rank-history/report-export-service", () => ({
  prepareRankHistoryExport: mocks.report,
}));
vi.mock("@/lib/rank-history/export-host", async () => {
  const { reportAsOf, reportPolicy } = await import("@/lib/rank-reports/report-test-fixture");
  return {
    historyExportReportOptions: () => ({
      asOf: reportAsOf,
      limits: { maxTargets: 1000, maxChecks: 1000, maxItems: 1000 },
      policyAt: reportPolicy,
      loadMetadata: async () => new Map(),
    }),
  };
});
vi.mock("@/lib/rank-reports/host-cursor", () => ({ hostRankReportCursorCodec: vi.fn() }));
vi.mock("@/lib/keywords/export-audit", () => ({ auditKeywordExport: mocks.audit }));
vi.mock("./keyword-export-limits", () => ({ assertCloudImportPackageLimits: mocks.limits }));
vi.mock("./_shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_shared")>();
  return { ...actual, getActionActor: mocks.actor, requireProjectScope: mocks.scope };
});
const query = {
  ...defaultRankTrackerQueryState,
  filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
  page: 3,
  pageSize: 25 as const,
};

// Transport/source wiring: owned PostgreSQL regressions exercise the actual selection and authorization.
describe("query-backed keyword export action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ id: "user_1", memberships: [] });
    mocks.scope.mockResolvedValue({ id: "internal_project", publicId: PROJECT_ID });
    mocks.snapshot.mockImplementation(async () => historyExportSnapshotFixture());
    mocks.report.mockResolvedValue({
      reportRows: [],
      meta: { summary: { retainedHistory: { targets: 2 } } },
    });
  });
  it.each(["current", "history"] as const)(
    "v1 %s resolves its query inside the actual export snapshot",
    async (scope) => {
      await exportKeywords({
        format: "csv",
        projectId: PROJECT_ID,
        scope,
        range: "all",
        selection: { mode: "query", query },
      });
      expect(mocks.scope).toHaveBeenCalledWith(expect.anything(), "read", PROJECT_ID, {
        type: "keyword",
      });
      expect(mocks.snapshot).toHaveBeenCalledWith(
        expect.objectContaining({ transport: "session" }),
        { projectId: PROJECT_ID, keywordIds: undefined, query },
        expect.anything(),
      );
      expect(mocks.legacyResolve).not.toHaveBeenCalled();
    },
  );
  it("v1 preserves historical URL, JSON envelope, filename and one audit", async () => {
    const result = await exportKeywords({
      format: "json",
      projectId: PROJECT_ID,
      scope: "history",
      range: "all",
      selection: { mode: "all" },
    });
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      projectId: PROJECT_ID,
      scope: "history",
      keywords: [
        {
          rankingHistory: [
            { position: 4, previousPosition: 9, rankingUrl: "https://example.test/old" },
          ],
        },
      ],
    });
    expect(result.filename).toBe(`bisibility-keywords-${PROJECT_ID}-history.json`);
    expect(result.count).toBe(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it.each(["current", "history"] as const)(
    "rejects duplicate selected IDs for %s before reading",
    async (scope) => {
      await expect(
        exportKeywords({
          format: "csv",
          projectId: PROJECT_ID,
          scope,
          selection: { keywordIds: [KEYWORD_IDS[0], KEYWORD_IDS[0]], mode: "selected" },
        }),
      ).rejects.toThrow("Selected keyword IDs must be unique.");
      expect(mocks.scope).not.toHaveBeenCalled();
      expect(mocks.snapshot).not.toHaveBeenCalled();
    },
  );
  it("preserves all-project, selected and intentionally empty membership modes", async () => {
    for (const selection of [
      { mode: "all" as const },
      { mode: "selected" as const, keywordIds: [KEYWORD_IDS[0]] },
      { mode: "selected" as const, keywordIds: [] },
    ]) {
      await exportKeywords({ format: "csv", projectId: PROJECT_ID, scope: "current", selection });
      expect(mocks.snapshot).toHaveBeenLastCalledWith(
        expect.anything(),
        {
          projectId: PROJECT_ID,
          keywordIds: selection.mode === "selected" ? selection.keywordIds : undefined,
          query: undefined,
        },
        expect.anything(),
      );
    }
    expect(mocks.legacyResolve).not.toHaveBeenCalled();
  });
  it("v2 uses the same query cohort through its shared report snapshot path", async () => {
    const result = await exportKeywords({
      format: "json",
      historyVersion: 2,
      projectId: PROJECT_ID,
      scope: "history",
      range: "all",
      selection: { mode: "query", query },
    });
    expect(mocks.report).toHaveBeenCalledWith(
      expect.objectContaining({ transport: "session" }),
      expect.objectContaining({ version: "2", range: "all", keywordIds: undefined }),
      PROJECT_ID,
      expect.anything(),
      query,
    );
    expect(mocks.legacyResolve).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(result.count).toBe(2);
    expect(result.filename).toContain("history-v2.json");
  });
});
