import { ApiNotFoundError } from "@/lib/api/errors";
import { runDomain } from "@/lib/api/surface";
import { notFound, redirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getQueryActor,
  requireReadableProject,
  requireReadableProjectFor,
  resolveProjectAccess,
} from "./_auth";

const mocks = vi.hoisted(() => ({
  AuthorizationError: class extends Error {
    constructor(
      readonly code: "unauthenticated" | "forbidden",
      message: string,
    ) {
      super(message);
    }
  },
  authorize: vi.fn(),
  cacheEntries: new Map<unknown, Map<string, unknown>>(),
  prisma: {
    project: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    session: { deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
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
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
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
    notFound.mockImplementation(() => {
      throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
    });
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
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
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("returns not found for an unknown public id", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(null);

    await expect(resolveProjectAccess("prj_i00000000000000000000000")).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("rejects a ref that is not a project public id without touching the database", async () => {
    await expect(resolveProjectAccess("overview")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a public id from another resource", async () => {
    await expect(resolveProjectAccess("kw_aaaaaaaaaaaaaaaaaaaaaaaa")).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });
});

describe("requireReadableProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
    });
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
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
    await expect(requireReadableProject("project_1")).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );

    expect(mocks.prisma.project.findFirst).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("returns a framework 404 for a deleted project through the cached lookup", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue(null);
    await expect(requireReadableProject("prj_a00000000000000000000000")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(notFound).toHaveBeenCalledOnce();
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it.each(["project_1", "prj_a00000000000000000000000"])(
    "preserves the API not-found mapping for explicit-actor lookup of %s",
    async (ref) => {
      mocks.prisma.project.findFirst.mockResolvedValue(null);
      const result = runDomain(() =>
        requireReadableProjectFor({ id: "user_1", role: null, memberships: [] }, ref),
      );
      await expect(result).rejects.toBeInstanceOf(ApiNotFoundError);
      await expect(result).rejects.toThrow("Project not found.");
      expect(notFound).not.toHaveBeenCalled();
      expect(mocks.authorize).not.toHaveBeenCalled();
      expect(mocks.requireSession).not.toHaveBeenCalled();
      if (ref === "project_1") expect(mocks.prisma.project.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(["cached", "explicit actor"])(
    "preserves a database outage through %s lookup",
    async (mode) => {
      const failure = new Error("database connection unavailable");
      mocks.prisma.project.findFirst.mockRejectedValue(failure);
      const ref = "prj_a00000000000000000000000";
      const result =
        mode === "cached"
          ? requireReadableProject(ref)
          : requireReadableProjectFor({ id: "user_1", role: null, memberships: [] }, ref);
      await expect(result).rejects.toBe(failure);
      expect(notFound).not.toHaveBeenCalled();
      expect(mocks.authorize).not.toHaveBeenCalled();
    },
  );

  it.each(["cached", "explicit actor"])(
    "continues checking authorization through %s lookup",
    async (mode) => {
      mocks.prisma.project.findFirst.mockResolvedValue({ id: "other-project" });
      const failure = new mocks.AuthorizationError("forbidden", "access denied");
      mocks.authorize.mockImplementationOnce(() => {
        throw failure;
      });
      const ref = "prj_a00000000000000000000000";
      const result =
        mode === "cached"
          ? requireReadableProject(ref)
          : requireReadableProjectFor({ id: "user_1", role: null, memberships: [] }, ref);
      await expect(result).rejects.toBe(failure);
      expect(notFound).not.toHaveBeenCalled();
    },
  );
});

describe("getQueryActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
    });
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
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
