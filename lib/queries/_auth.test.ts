import { beforeEach, describe, expect, it, vi } from "vitest";
import { getQueryActor, requireReadableProject, resolveProjectAccess } from "./_auth";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  cacheEntries: new Map<unknown, Map<string, unknown>>(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  prisma: {
    project: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    session: { deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  requireSession: vi.fn(),
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
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

function mockMemberships(memberships: { projectId: string; role: string }[]) {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships,
    role: null,
  });
}

describe("resolveProjectAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheEntries.clear();
    mockMemberships([{ projectId: "project_1", role: "member" }]);
  });

  it("resolves a member project from its public id", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      id: "project_1",
      isSample: false,
      publicId: "prj_g00000000000000000000000",
    });

    await expect(resolveProjectAccess("prj_g00000000000000000000000")).resolves.toEqual({
      isSample: false,
      mode: "member",
      projectId: "project_1",
      publicId: "prj_g00000000000000000000000",
    });
    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith({
      select: { id: true, isSample: true, publicId: true },
      where: { publicId: "prj_g00000000000000000000000" },
    });
  });

  it("returns not found for a project the actor does not belong to", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      id: "project_2",
      isSample: false,
      publicId: "prj_h00000000000000000000000",
    });

    await expect(resolveProjectAccess("prj_h00000000000000000000000")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("returns not found for an unknown public id", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(null);

    await expect(resolveProjectAccess("prj_i00000000000000000000000")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("rejects a ref that is not a project public id without touching the database", async () => {
    await expect(resolveProjectAccess("overview")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a public id from another resource", async () => {
    await expect(resolveProjectAccess("kw_aaaaaaaaaaaaaaaaaaaaaaaa")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });
});

describe("requireReadableProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheEntries.clear();
    mockMemberships([
      { projectId: "project_1", role: "member" },
      { projectId: "project_2", role: "viewer" },
    ]);
  });

  it("shares one authorized project load across concurrent query helpers", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      publicId: "prj_a00000000000000000000000",
    });

    await Promise.all([
      requireReadableProject("prj_a00000000000000000000000"),
      requireReadableProject("prj_a00000000000000000000000"),
    ]);

    expect(mocks.requireSession).toHaveBeenCalledOnce();
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledOnce();
    expect(mocks.prisma.project.findFirst).toHaveBeenCalledOnce();
    expect(mocks.authorize).toHaveBeenCalledTimes(2);
  });

  it("rejects an internal project id before querying the database", async () => {
    await expect(requireReadableProject("project_1")).rejects.toThrow("Project not found.");

    expect(mocks.prisma.project.findFirst).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});

describe("getQueryActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheEntries.clear();
    mockMemberships([]);
  });

  it("redirects to sign in when the session references a deleted account", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    await expect(getQueryActor()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
  });

  it("keeps a real account with no memberships as a valid actor", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ memberships: [], role: "member" });

    await expect(getQueryActor()).resolves.toMatchObject({ id: "user_1", memberships: [] });
  });
});
