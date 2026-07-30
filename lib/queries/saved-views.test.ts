import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSavedView, listSavedViews } from "./saved-views";

const VIEW_PUBLIC_ID = "viw_abcdefghijklmnopqrstuvwx";
const VIEW_PUBLIC_ID_2 = "viw_bbcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => ({
  prisma: {
    savedView: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
  project: {
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: "prj_abcdefghijklmnopqrstuvwx",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

function savedView(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      filters: { tags: ["Product"], volMax: 20, volMin: 5 },
      search: "rank",
    },
    createdAt: new Date("2026-06-28T08:00:00.000Z"),
    createdById: "user_1",
    id: "view_1",
    name: "Product rank",
    publicId: VIEW_PUBLIC_ID,
    surface: "keywords",
    ...overrides,
  };
}

describe("saved view queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      actor: {
        id: "user_1",
        memberships: [{ projectId: "project_1", role: "member" }],
      },
      project: mocks.project,
    });
    mocks.prisma.savedView.findFirst.mockResolvedValue(null);
    mocks.prisma.savedView.findMany.mockResolvedValue([]);
  });

  it("lists saved views scoped to the authorized project", async () => {
    mocks.prisma.savedView.findMany.mockResolvedValue([savedView()]);

    const views = await listSavedViews("prj_abcdefghijklmnopqrstuvwx");

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_abcdefghijklmnopqrstuvwx");
    expect(mocks.prisma.savedView.findMany).toHaveBeenCalledWith({
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: expect.objectContaining({ config: true, id: true, name: true }),
      where: { projectId: "project_1", surface: "keywords" },
    });
    expect(views).toEqual([
      expect.objectContaining({
        config: expect.objectContaining({
          filters: expect.objectContaining({ tags: ["Product"], volMax: 20, volMin: 5 }),
          search: "rank",
        }),
        createdAt: "2026-06-28T08:00:00.000Z",
        canDelete: true,
        id: VIEW_PUBLIC_ID,
      }),
    ]);
  });

  it("loads a single saved view without leaking across projects", async () => {
    mocks.prisma.savedView.findFirst.mockResolvedValue(
      savedView({ id: "view_2", publicId: VIEW_PUBLIC_ID_2 }),
    );

    const view = await getSavedView("prj_abcdefghijklmnopqrstuvwx", VIEW_PUBLIC_ID_2);

    expect(mocks.prisma.savedView.findFirst).toHaveBeenCalledWith({
      select: expect.objectContaining({ config: true, id: true, name: true }),
      where: {
        projectId: "project_1",
        publicId: VIEW_PUBLIC_ID_2,
        surface: "keywords",
      },
    });
    expect(view).toMatchObject({ canDelete: true, id: VIEW_PUBLIC_ID_2 });
    expect(view).not.toHaveProperty("createdById");
  });

  it("keeps legacy keyword views visible while normalizing known fields", async () => {
    mocks.prisma.savedView.findMany.mockResolvedValue([
      savedView({ config: { extra: true, search: "legacy rank", version: 2 } }),
    ]);

    const views = await listSavedViews("prj_abcdefghijklmnopqrstuvwx");

    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      config: { search: "legacy rank", surface: "keywords", version: 1 },
      id: VIEW_PUBLIC_ID,
    });
  });

  it("returns null for an empty view id before querying", async () => {
    await expect(getSavedView("prj_abcdefghijklmnopqrstuvwx", null)).resolves.toBeNull();

    expect(mocks.requireReadableProject).not.toHaveBeenCalled();
    expect(mocks.prisma.savedView.findFirst).not.toHaveBeenCalled();
  });

  it("isolates competitor views from keyword views with the same name", async () => {
    mocks.prisma.savedView.findMany.mockResolvedValue([
      savedView({
        config: {
          filters: { excludedKeywordIds: [], position: "all", tag: null },
          scope: { device: "desktop", engine: "google", locationId: "location_us" },
          surface: "competitors",
          version: 1,
        },
        name: "Q3",
        surface: "competitors",
      }),
    ]);

    const views = await listSavedViews("prj_abcdefghijklmnopqrstuvwx", "competitors");

    expect(mocks.prisma.savedView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_1", surface: "competitors" } }),
    );
    expect(views[0]).toMatchObject({ name: "Q3", surface: "competitors" });
  });
});
