import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveAuthorizedRankTrackerExportKeywordIds,
  resolveRankTrackerExportKeywordIds,
} from "./rank-tracker-selection";

const mocks = vi.hoisted(() => ({
  exact: vi.fn(),
  filterExact: vi.fn(),
  hydrate: vi.fn(),
  queryRaw: vi.fn(),
  read: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.read }));
vi.mock("./keyword-row-loader", () => ({ loadKeywordRowsByInternalIds: mocks.hydrate }));
vi.mock("./rank-tracker-list-exact", () => ({
  exactRankTrackerRows: mocks.exact,
  filterExactRankTrackerRows: mocks.filterExact,
}));

const project = { domain: "example.com", id: "internal_project" };
const raw = (keywordIds: string[]) => ({
  facets: { intents: [], positions: [], tags: [], topics: [] },
  keywordIds,
  locations: [],
  matchedTargetCount: keywordIds.length,
  nextCandidateCursor: keywordIds.length
    ? { createdAt: "2026-08-25T18:30:00.000Z", id: keywordIds.at(-1) }
    : null,
  totalCount: keywordIds.length,
});
const ids = (count: number, prefix = "kw") =>
  Array.from({ length: count }, (_, index) => `${prefix}_${String(index).padStart(24, "a")}`);

describe("rank tracker export membership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ project });
    mocks.queryRaw.mockResolvedValue([raw(["kw_first", "kw_after_page"])]);
    mocks.hydrate.mockResolvedValue([]);
    mocks.exact.mockImplementation((rows) => rows);
    mocks.filterExact.mockImplementation((rows) => rows);
  });

  it.each([
    { page: 1, pageSize: 10 as const },
    { page: 10_000, pageSize: 50 as const },
  ])("ignores valid pagination for complete membership", async ({ page, pageSize }) => {
    await expect(
      resolveAuthorizedRankTrackerExportKeywordIds(project, {
        ...defaultRankTrackerQueryState,
        page,
        pageSize,
      }),
    ).resolves.toEqual(["kw_first", "kw_after_page"]);
    const statement = mocks.queryRaw.mock.calls[0][0];
    expect(statement.sql).toContain("LIMIT ? OFFSET ?");
    expect(statement.values).toContain(501);
    expect(statement.values).not.toContain(page * pageSize);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects a broad SQL result at 501 before hydration", async () => {
    mocks.queryRaw.mockResolvedValueOnce([raw(ids(501))]);
    await expect(
      resolveAuthorizedRankTrackerExportKeywordIds(project, defaultRankTrackerQueryState),
    ).rejects.toThrow("up to 500 keywords");
    expect(mocks.hydrate).not.toHaveBeenCalled();
  });

  it("accepts exactly 500 broad SQL matches", async () => {
    const keywordIds = ids(500);
    mocks.queryRaw.mockResolvedValueOnce([raw(keywordIds)]);
    await expect(
      resolveAuthorizedRankTrackerExportKeywordIds(project, defaultRankTrackerQueryState),
    ).resolves.toEqual(keywordIds);
  });

  it("returns every broad SQL match when the membership limit is disabled", async () => {
    const keywordIds = ids(501);
    mocks.queryRaw.mockResolvedValueOnce([raw(keywordIds)]);

    await expect(
      resolveAuthorizedRankTrackerExportKeywordIds(project, defaultRankTrackerQueryState, {
        membershipLimit: null,
      }),
    ).resolves.toEqual(keywordIds);
    expect(mocks.queryRaw.mock.calls[0][0].sql).not.toContain("LIMIT ? OFFSET ?");
  });

  it("chunks exact candidates and stops when the 501st exact match is proven", async () => {
    const candidateChunks = [
      ids(250, "internal_a"),
      ids(250, "internal_b"),
      ids(250, "internal_c"),
    ];
    mocks.queryRaw
      .mockResolvedValueOnce([raw(candidateChunks[0])])
      .mockResolvedValueOnce([raw(candidateChunks[1])])
      .mockResolvedValueOnce([raw(candidateChunks[2])]);
    mocks.hydrate.mockImplementation(async (_project, chunk) =>
      chunk.map((id: string) => ({ id })),
    );
    mocks.exact.mockImplementation((rows) => rows);
    const query = {
      ...defaultRankTrackerQueryState,
      filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
    };
    await expect(resolveAuthorizedRankTrackerExportKeywordIds(project, query)).rejects.toThrow(
      "up to 500 keywords",
    );
    expect(mocks.hydrate).toHaveBeenCalledTimes(3);
    expect(mocks.hydrate.mock.calls.every((call) => call[1].length <= 250)).toBe(true);
  });

  it("accepts exactly 500 exact matches with deterministic final ordering", async () => {
    const first = ids(250, "internal_a");
    const second = ids(250, "internal_b");
    mocks.queryRaw
      .mockResolvedValueOnce([raw(first)])
      .mockResolvedValueOnce([raw(second)])
      .mockResolvedValueOnce([raw([])]);
    mocks.hydrate.mockImplementation(async (_project, chunk) =>
      chunk.map((id: string) => ({ id })),
    );
    mocks.exact.mockImplementation((rows) => rows.slice().reverse());
    const query = {
      ...defaultRankTrackerQueryState,
      filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
    };
    await expect(
      resolveAuthorizedRankTrackerExportKeywordIds(project, query),
    ).resolves.toHaveLength(500);
    expect(mocks.hydrate.mock.calls.every((call) => call[1].length <= 250)).toBe(true);
  });

  it("returns every exact match when the membership limit is disabled", async () => {
    const candidateChunks = [ids(250, "internal_a"), ids(250, "internal_b"), ids(1, "internal_c")];
    mocks.queryRaw
      .mockResolvedValueOnce([raw(candidateChunks[0])])
      .mockResolvedValueOnce([raw(candidateChunks[1])])
      .mockResolvedValueOnce([raw(candidateChunks[2])]);
    mocks.hydrate.mockImplementation(async (_project, chunk) =>
      chunk.map((id: string) => ({ id })),
    );
    const query = {
      ...defaultRankTrackerQueryState,
      filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
    };

    await expect(
      resolveAuthorizedRankTrackerExportKeywordIds(project, query, { membershipLimit: null }),
    ).resolves.toHaveLength(501);
    expect(mocks.hydrate).toHaveBeenCalledTimes(3);
  });

  it("uses keyset cursors and keeps mutable requested sorting out of exact scans", async () => {
    const first = ids(250, "internal_first");
    const second = ids(10, "internal_second");
    mocks.queryRaw.mockResolvedValueOnce([raw(first)]).mockResolvedValueOnce([raw(second)]);
    mocks.hydrate.mockImplementation(async (_project, chunk) =>
      chunk.map((id: string) => ({ id })),
    );
    const query = {
      ...defaultRankTrackerQueryState,
      filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
      sort: { direction: "asc" as const, field: "clicks" as const },
    };

    await resolveAuthorizedRankTrackerExportKeywordIds(project, query);

    const firstSql = mocks.queryRaw.mock.calls[0][0];
    const secondSql = mocks.queryRaw.mock.calls[1][0];
    expect(firstSql.sql).toContain('ORDER BY k."createdAt" DESC, k.id DESC LIMIT ?');
    expect(firstSql.sql).not.toContain(" OFFSET ");
    expect(secondSql.sql).toContain('(k."createdAt", k.id) < (?, ?)');
    expect(secondSql.values).toContain(first.at(-1));
    expect(secondSql.sql).not.toContain(" OFFSET ");
  });

  it("deduplicates repeated internal candidates before hydration and limit accounting", async () => {
    const first = ids(250, "internal_first");
    const boundaryMove = first.slice(200);
    const second = [...boundaryMove, ...ids(200, "internal_second")];
    const third = ids(50, "internal_third");
    mocks.queryRaw
      .mockResolvedValueOnce([raw(first)])
      .mockResolvedValueOnce([raw(second)])
      .mockResolvedValueOnce([raw(third)]);
    mocks.hydrate.mockImplementation(async (_project, chunk) =>
      chunk.map((id: string) => ({ id })),
    );
    const query = {
      ...defaultRankTrackerQueryState,
      filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
    };

    await expect(
      resolveAuthorizedRankTrackerExportKeywordIds(project, query),
    ).resolves.toHaveLength(500);
    expect(mocks.hydrate.mock.calls[1][1]).toEqual(ids(200, "internal_second"));
  });

  it("keeps the public grid entry authorization boundary", async () => {
    await resolveRankTrackerExportKeywordIds("prj_public", defaultRankTrackerQueryState);
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledWith("prj_public");
  });

  it("blocks foreign project access before SQL resolution", async () => {
    mocks.read.mockRejectedValueOnce(new Error("not authorized"));
    await expect(
      resolveRankTrackerExportKeywordIds("prj_foreign", defaultRankTrackerQueryState),
    ).rejects.toThrow("not authorized");
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});
