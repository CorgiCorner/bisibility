import { beforeEach, describe, expect, it, vi } from "vitest";
import { listWorkspaces } from "./workspaces";

const mocks = vi.hoisted(() => ({
  cacheEntries: new Map<unknown, Map<string, unknown>>(),
  getQueryActor: vi.fn(),
  prisma: {
    project: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      let entries = mocks.cacheEntries.get(fn);
      if (!entries) {
        entries = new Map();
        mocks.cacheEntries.set(fn, entries);
      }
      const key = JSON.stringify(args);
      if (!entries.has(key)) entries.set(key, fn(...args));
      return entries.get(key);
    },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ getQueryActor: mocks.getQueryActor }));

function project(overrides: Record<string, unknown> = {}) {
  return {
    _count: { keywords: 2 },
    domain: "example.com",
    id: "project_1",
    keywords: [
      { rankChecks: [{ checkedAt: new Date("2026-06-28T10:00:00.000Z") }] },
      { rankChecks: [{ checkedAt: new Date("2026-06-30T12:00:00.000Z") }] },
    ],
    isSample: false,
    name: "Example",
    onboardingCompletedAt: new Date("2026-06-01T12:00:00.000Z"),
    providerConnections: [],
    publicId: "prj_abcdefghijklmnopqrstuvwx",
    ...overrides,
  };
}

describe("listWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheEntries.clear();
    mocks.getQueryActor.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "owner" }],
    });
  });

  it("shares the workspace query across layout and page loaders", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([project()]);

    const [layoutWorkspaces, pageWorkspaces] = await Promise.all([
      listWorkspaces(),
      listWorkspaces(),
    ]);

    expect(layoutWorkspaces).toBe(pageWorkspaces);
    expect(mocks.getQueryActor).toHaveBeenCalledOnce();
    expect(mocks.prisma.project.findMany).toHaveBeenCalledOnce();
  });

  it("returns the latest completed rank-check timestamp for header freshness", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([project()]);

    const workspaces = await listWorkspaces();

    expect(mocks.prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          keywords: expect.objectContaining({
            select: expect.objectContaining({
              rankChecks: expect.objectContaining({
                where: { status: "completed" },
              }),
            }),
          }),
          onboardingCompletedAt: true,
        }),
      }),
    );
    expect(workspaces[0]).toMatchObject({
      id: "prj_abcdefghijklmnopqrstuvwx",
      isSample: false,
      latestCompletedRankCheckAt: new Date("2026-06-30T12:00:00.000Z"),
      onboardingCompletedAt: new Date("2026-06-01T12:00:00.000Z"),
      state: "populated",
    });
  });

  it("marks sample workspaces from the persisted sample flag", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([
      project({ isSample: true, publicId: "prj_bbcdefghijklmnopqrstuvwx" }),
    ]);

    const workspaces = await listWorkspaces();

    expect(workspaces[0]).toMatchObject({ isSample: true });
  });

  it("leaves freshness empty when no completed rank check exists", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([project({ keywords: [] })]);

    const workspaces = await listWorkspaces();

    expect(workspaces[0]).toMatchObject({
      latestCompletedRankCheckAt: null,
      state: "no-data",
    });
  });
});
