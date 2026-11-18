import { beforeEach, expect, it, vi } from "vitest";
import { getSchedule, listSchedules } from "./service";

const mocks = vi.hoisted(() => ({
  rank: vi.fn(),
  aiRows: vi.fn(),
  ai: vi.fn(),
  local: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("./checks", () => ({
  listRankSchedules: mocks.rank,
  listAiScheduleRows: mocks.aiRows,
  projectAiSchedules: mocks.ai,
}));
vi.mock("./local-monitors", () => ({ listLocalMonitorSchedules: mocks.local }));
vi.mock("./data-syncs", () => ({ listDataSyncSchedules: mocks.sync }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rank.mockImplementation(async (project: string, status: string) => [
    { id: `${project}:${status}:rank`, kind: "rank" },
  ]);
  mocks.aiRows.mockResolvedValue([]);
  mocks.ai.mockResolvedValue([{ id: "ai", kind: "ai" }]);
  mocks.local.mockResolvedValue([{ id: "monitor", kind: "local_monitor" }]);
  mocks.sync.mockResolvedValue(
    ["domain_rating", "sitemap", "search_console", "page_indexing"].map((sync_kind) => ({
      id: sync_kind,
      kind: "data_sync",
      sync_kind,
    })),
  );
});
it("includes all four kinds and every data sync for a fully configured project", async () => {
  const rows = await listSchedules("project");
  expect(rows.map((row) => row.kind)).toEqual([
    "rank",
    "ai",
    "local_monitor",
    "data_sync",
    "data_sync",
    "data_sync",
    "data_sync",
  ]);
  expect(rows.filter((row) => row.kind === "data_sync").map((row) => row.sync_kind)).toEqual([
    "domain_rating",
    "sitemap",
    "search_console",
    "page_indexing",
  ]);
  for (const mock of [mocks.rank, mocks.aiRows, mocks.ai, mocks.local, mocks.sync])
    expect(mock.mock.calls[0][0]).toBe("project");
});
it("keeps syncs out of the archive and honors unavailable AI access", async () => {
  mocks.ai.mockResolvedValue([]);
  const rows = await listSchedules("project", { status: "archived", ai: null });
  expect(mocks.aiRows).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(rows.map((row) => row.kind)).toEqual(["rank", "local_monitor"]);
});
it("looks up stable ids inside the requested project, including archived rows", async () => {
  expect(await getSchedule("project", "project:archived:rank")).toMatchObject({
    id: "project:archived:rank",
  });
  expect(await getSchedule("other", "project:current:rank")).toBeNull();
});
