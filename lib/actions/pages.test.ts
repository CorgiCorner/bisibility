import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addManualProjectPagesAction,
  loadProjectPagesAction,
  refreshProjectPagesAction,
} from "./pages";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  addManual: vi.fn(),
  list: vi.fn(),
  record: vi.fn(),
  revalidate: vi.fn(),
  requireScope: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/pages/queries", () => ({ getProjectPagesList: mocks.list }));
vi.mock("@/lib/pages/sync", () => ({
  addManualProjectPages: mocks.addManual,
  syncProjectPages: mocks.sync,
}));
vi.mock("./_shared", () => ({
  getActionActor: vi.fn(async () => mocks.actor),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireScope,
}));

describe("refreshProjectPagesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireScope.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
    mocks.sync.mockResolvedValue({ pages: 2, projectId: "project_1", status: "ok" });
    mocks.list.mockResolvedValue({
      counts: { all: 0, listed: 0, notListed: 0 },
      rows: [],
      total: 0,
    });
    mocks.addManual.mockResolvedValue({ added: 1, existing: 0, rejected: [] });
  });

  it("requires project update and records the action only after a successful sync", async () => {
    await expect(refreshProjectPagesAction({ projectId: "prj_1" })).resolves.toMatchObject({
      status: "ok",
    });
    expect(mocks.requireScope).toHaveBeenCalledWith(mocks.actor, "update", "prj_1", {
      type: "project",
    });
    expect(mocks.record).toHaveBeenCalledWith(mocks.actor);

    mocks.sync.mockResolvedValue({ projectId: "project_1", status: "error" });
    await refreshProjectPagesAction({ projectId: "prj_1" });
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).toHaveBeenCalledWith("/app/prj_1/pages");
  });
});

describe("loadProjectPagesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireScope.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
    mocks.list.mockResolvedValue({ rows: [], total: 0 });
  });

  it("reads one page with the project scope and a fixed page size", async () => {
    await loadProjectPagesAction({
      dir: "desc",
      page: 2,
      period: "28",
      projectId: "prj_1",
      sort: "clicks",
    });
    expect(mocks.requireScope).toHaveBeenCalledWith(
      mocks.actor,
      "read",
      "prj_1",
      { type: "project" },
      {
        allowReadOnly: true,
      },
    );
    expect(mocks.list).toHaveBeenCalledWith(
      "project_1",
      expect.objectContaining({ page: 2, pageSize: 50, sort: { by: "clicks", dir: "desc" } }),
    );
  });
});

describe("addManualProjectPagesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireScope.mockResolvedValue({ id: "project_1", publicId: "prj_1" });
    mocks.addManual.mockResolvedValue({
      added: 1,
      existing: 1,
      rejected: [{ line: 2, reason: "no", value: "x" }],
    });
  });

  it("rejects a paste longer than 500 lines before writing", async () => {
    const text = `${"https://example.com/docs\n".repeat(500)}https://example.com/extra`;
    await expect(addManualProjectPagesAction({ projectId: "prj_1", text })).resolves.toMatchObject({
      added: 0,
      rejected: [expect.objectContaining({ line: 501 })],
    });
    expect(mocks.addManual).not.toHaveBeenCalled();
  });

  it("passes the paste to the registry and reports rejected lines", async () => {
    await expect(
      addManualProjectPagesAction({ projectId: "prj_1", text: "https://example.com/docs\nbad" }),
    ).resolves.toMatchObject({
      added: 1,
      existing: 1,
      rejected: [{ line: 2, reason: "no", value: "x" }],
    });
    expect(mocks.requireScope).toHaveBeenCalledWith(mocks.actor, "update", "prj_1", {
      type: "project",
    });
    expect(mocks.addManual).toHaveBeenCalledWith(
      "project_1",
      ["https://example.com/docs\nbad"],
      mocks.actor,
    );
  });
});
