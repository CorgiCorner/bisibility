import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), group: vi.fn(), receipt: vi.fn() }));
vi.mock("@/lib/activity/result-receipt-extension", () => ({ recordResultReceipt: mocks.receipt }));
vi.mock("./rank-tracker-selection-core", () => ({ selectRankTrackerReportKeywords: mocks.select }));
vi.mock("./rank-tracker-report-grouped", () => ({ groupRankTrackerReportRows: mocks.group }));
vi.mock("@/lib/keywords/view-devices", () => ({ keywordViewDevices: () => [] }));

import { getRankTrackerGroupedList } from "./rank-tracker-grouped-list";
import { getRankTrackerKeywordList } from "./rank-tracker-list";

beforeEach(() => vi.clearAllMocks());

it.each([false, true])("records only the delivered page, grouped=%s", async (grouped) => {
  const query = { grouped, page: 2, pageSize: 1 };
  const rows = [
    { hasRankData: true, checkState: "ranked" },
    { hasRankData: false, checkState: "unknown" },
  ];
  mocks.select.mockResolvedValue({ query, rows, selectedKeywordIds: [] });
  mocks.group.mockReturnValue(rows.map((row) => ({ subRows: [row] })));
  const read = grouped ? getRankTrackerGroupedList : getRankTrackerKeywordList;
  const input = { query } as Parameters<typeof read>[0];
  const options = {
    context: { actor: { id: "person" }, transport: "session" },
  } as Parameters<typeof read>[1];
  await read(input, options);
  expect(mocks.receipt).toHaveBeenLastCalledWith({
    userId: "person",
    surface: "app",
    nonEmpty: false,
  });
  query.page = 1;
  await read(input, options);
  expect(mocks.receipt).toHaveBeenLastCalledWith({
    userId: "person",
    surface: "app",
    nonEmpty: true,
  });
});

it.each([false, true])("leaves API delivery to the dispatcher, grouped=%s", async (grouped) => {
  const query = { grouped, page: 1, pageSize: 1 };
  mocks.select.mockResolvedValue({
    query,
    rows: [{ hasRankData: true, checkState: "ranked" }],
    selectedKeywordIds: [],
  });
  mocks.group.mockReturnValue([{ subRows: [{ hasRankData: true, checkState: "ranked" }] }]);
  const read = grouped ? getRankTrackerGroupedList : getRankTrackerKeywordList;
  await read(
    { query } as Parameters<typeof read>[0],
    {
      context: { actor: { id: "person" }, transport: "personal_token" },
    } as Parameters<typeof read>[1],
  );
  expect(mocks.receipt).not.toHaveBeenCalled();
});

it.each([false, true])(
  "accepts known absence and rejects unmeasured states, grouped=%s",
  async (grouped) => {
    const query = { grouped, page: 1, pageSize: 1 };
    const read = grouped ? getRankTrackerGroupedList : getRankTrackerKeywordList;
    for (const checkState of [
      "ranked",
      "not_ranked",
      "unknown",
      "failed",
      "running",
      "never_checked",
    ]) {
      // A stale positive compatibility field must not make a failed attempt qualify.
      const row = { checkState, hasRankData: checkState !== "not_ranked" };
      mocks.select.mockResolvedValue({ query, rows: [row], selectedKeywordIds: [] });
      mocks.group.mockReturnValue([{ subRows: [row] }]);
      await read(
        { query } as Parameters<typeof read>[0],
        {
          context: { actor: { id: "person" }, transport: "session" },
        } as Parameters<typeof read>[1],
      );
      expect(mocks.receipt).toHaveBeenLastCalledWith({
        userId: "person",
        surface: "app",
        nonEmpty: ["ranked", "not_ranked"].includes(checkState),
      });
    }
  },
);
