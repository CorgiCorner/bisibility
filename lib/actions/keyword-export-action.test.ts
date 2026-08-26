import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportKeywords } from "./keyword-export-action";

const PROJECT_ID = "prj_abcdefghijklmnopqrstuvwx";
const KEYWORD_IDS = ["kw_abcdefghijklmnopqrstuvwx", "kw_bbcdefghijklmnopqrstuvwx"];
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  audit: vi.fn(),
  findMany: vi.fn(),
  history: vi.fn(),
  limits: vi.fn(),
  resolve: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { keyword: { findMany: mocks.findMany } } }));
vi.mock("@/lib/queries/rank-tracker-selection", () => ({
  resolveAuthorizedRankTrackerExportKeywordIds: mocks.resolve,
}));
vi.mock("@/lib/rank-history/export-service", () => ({ loadRankHistoryExport: mocks.history }));
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
  pageSize: 10 as const,
};

describe("query-backed keyword export action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ id: "user_1", memberships: [] });
    mocks.scope.mockResolvedValue({ id: "internal_project", publicId: PROJECT_ID });
    mocks.resolve.mockResolvedValue(KEYWORD_IDS);
    mocks.findMany.mockResolvedValue([]);
    mocks.history.mockResolvedValue({ keywords: [], project: {} });
  });

  it("resolves complete query membership before current export", async () => {
    await exportKeywords({
      format: "csv",
      projectId: PROJECT_ID,
      scope: "current",
      selection: { mode: "query", query },
    });
    expect(mocks.scope).toHaveBeenCalledWith(expect.anything(), "read", PROJECT_ID, {
      type: "keyword",
    });
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ id: "internal_project", publicId: PROJECT_ID }),
      query,
    );
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "internal_project", publicId: { in: KEYWORD_IDS } },
      }),
    );
  });

  it("passes the same resolved membership to history export", async () => {
    await exportKeywords({
      format: "json",
      projectId: PROJECT_ID,
      range: "all",
      scope: "history",
      selection: { mode: "query", query },
    });
    expect(mocks.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ id: "internal_project", publicId: PROJECT_ID }),
      query,
    );
    expect(mocks.history).toHaveBeenCalledWith(
      expect.objectContaining({
        keywordIds: KEYWORD_IDS,
        projectId: "internal_project",
      }),
    );
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it.each(["current", "history"] as const)(
    "rejects duplicate selected IDs for %s before loading export rows",
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
      expect(mocks.findMany).not.toHaveBeenCalled();
      expect(mocks.history).not.toHaveBeenCalled();
    },
  );

  it("preserves all-project and selected membership modes", async () => {
    await exportKeywords({
      format: "csv",
      projectId: PROJECT_ID,
      scope: "current",
      selection: { mode: "all" },
    });
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { projectId: "internal_project" },
      }),
    );
    await exportKeywords({
      format: "csv",
      projectId: PROJECT_ID,
      scope: "current",
      selection: { keywordIds: [KEYWORD_IDS[0]], mode: "selected" },
    });
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { projectId: "internal_project", publicId: { in: [KEYWORD_IDS[0]] } },
      }),
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
