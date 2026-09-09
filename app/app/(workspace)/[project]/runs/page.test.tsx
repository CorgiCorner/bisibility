import { redirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunsPage from "./page";

const mocks = vi.hoisted(() => ({
  content: vi.fn(() => null),
  listProjectRuns: vi.fn(),
  readOperationSnapshot: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/components/project-runs/ProjectRunsContent", () => ({
  ProjectRunsContent: mocks.content,
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/rank-check/runs/snapshot", () => ({
  readOperationSnapshot: mocks.readOperationSnapshot,
}));
vi.mock("@/lib/runs/project-runs-query", () => ({ listProjectRuns: mocks.listProjectRuns }));

const projectRef = "prj_abcdefghijklmnopqrstuvwx";

describe("RunsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({ projectId: "project_1", publicId: projectRef });
    mocks.requireReadableProject.mockResolvedValue({
      actor: {
        id: "user_1",
        memberships: [{ projectId: "project_1", role: "member" }],
        role: "member",
      },
      project: { id: "project_1", name: "Example", publicId: projectRef, writeMode: "active" },
    });
    mocks.listProjectRuns.mockResolvedValue({
      counts: { rankChecks: 0, searchConsole: 1, total: 1 },
      nextCursor: null,
      runs: [],
    });
    mocks.readOperationSnapshot.mockResolvedValue([
      {
        capabilities: { pause: true, resume: false, retry: false },
        id: "import_1",
        kind: "gsc_import",
        presentation: { action: "pause", supportingText: null, title: "Importing" },
        progress: { done: 28, total: 488 },
        property: "sc-domain:example.com",
        state: "running",
      },
    ]);
  });

  it("loads the default page and passes one active GSC snapshot alongside the durable list", async () => {
    const rendered = await RunsPage({
      params: Promise.resolve({ project: projectRef }),
      searchParams: Promise.resolve({}),
    });
    const content = (rendered.props.children as { props: Record<string, unknown> }).props;

    expect(mocks.listProjectRuns).toHaveBeenCalledWith(
      { id: "project_1", name: "Example", publicId: projectRef },
      { cursor: null, limit: 20, source: "all", status: "all", view: "runs" },
    );
    expect(mocks.readOperationSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.readOperationSnapshot).toHaveBeenCalledWith("project_1");
    expect(content).toMatchObject({
      operations: [expect.objectContaining({ id: "import_1", progress: { done: 28, total: 488 } })],
      projectRef,
    });
  });

  it("opens old Planned URLs with the Upcoming query and preserves pagination", async () => {
    await RunsPage({
      params: Promise.resolve({ project: projectRef }),
      searchParams: Promise.resolve({
        view: "planned",
        cursor: "upcoming-page",
        source: "rank_checks",
      }),
    });
    expect(mocks.listProjectRuns).toHaveBeenCalledWith(expect.anything(), {
      cursor: "upcoming-page",
      limit: 20,
      source: "rank_checks",
      status: "all",
      view: "planned",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("removes the hidden status restriction from legacy Planned links", async () => {
    redirect.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });
    await expect(
      RunsPage({
        params: Promise.resolve({ project: projectRef }),
        searchParams: Promise.resolve({
          view: "planned",
          status: "attention",
          cursor: "old-page",
          source: "rank_checks",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(
      `/app/${projectRef}/runs?view=planned&source=rank_checks`,
    );
    expect(mocks.listProjectRuns).not.toHaveBeenCalled();
  });

  it("passes the GSC-only URL filter to the durable list without changing the page limit", async () => {
    await RunsPage({
      params: Promise.resolve({ project: projectRef }),
      searchParams: Promise.resolve({ source: "search_console" }),
    });

    expect(mocks.listProjectRuns).toHaveBeenCalledWith(
      { id: "project_1", name: "Example", publicId: projectRef },
      { cursor: null, limit: 20, source: "search_console", status: "all", view: "runs" },
    );
  });
});
