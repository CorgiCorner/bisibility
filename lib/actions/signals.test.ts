import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSignalNote, removeSignalNote } from "./signals";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    constructor(readonly code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.name = "AuthorizationError";
    }
  }
  const roleRank = { admin: 2, auditor: 0.5, member: 1, owner: 3, viewer: 0 };
  const minimumRoleByAction = {
    create: "member",
    delete: "admin",
    manage: "admin",
    read: "viewer",
    update: "member",
  } as const;
  const prisma = {
    keyword: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
    signal: { delete: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  };

  return {
    AuthorizationError,
    authorize: vi.fn((actor, action, resource) => {
      if (!actor) throw new AuthorizationError("unauthenticated");
      const role = actor.memberships?.find(
        (item: { projectId: string }) => item.projectId === resource.projectId,
      )?.role;
      const required =
        resource.requiredRole ?? minimumRoleByAction[action as keyof typeof minimumRoleByAction];
      if (
        !role ||
        roleRank[role as keyof typeof roleRank] < roleRank[required as keyof typeof roleRank]
      ) {
        throw new AuthorizationError("forbidden");
      }
      return { actorId: actor.id, projectId: resource.projectId, role };
    }),
    emitSignal: vi.fn(),
    prisma,
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emitSignal }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function mockActor(role: "admin" | "member" | "viewer" = "admin") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

const project = {
  id: "project_1",
  ownerId: "user_1",
  publicId: "prj_abcdefghijklmnopqrstuvwx",
  writeMode: "active",
};

const manualSignal = {
  id: "signal_1",
  keywordId: "keyword_1",
  payload: { note: "Launch annotation" },
  publicId: "sig_abcdefghijklmnopqrstuvwx",
  severity: "warning",
  source: "manual",
  type: "note",
  url: "https://example.com/pricing",
};

describe("signal actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor();
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      publicId: "kw_abcdefghijklmnopqrstuvwx",
      text: "seo software",
    });
    mocks.prisma.signal.findFirst.mockResolvedValue(manualSignal);
    mocks.emitSignal.mockResolvedValue(manualSignal);
    mocks.writeAudit.mockResolvedValue({});
  });

  it("rejects invalid note input before reading the session", async () => {
    await expect(addSignalNote({ note: "", projectId: "" })).rejects.toThrow();

    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("rejects non-http(s) note URLs before reading the session", async () => {
    await expect(
      addSignalNote({
        note: "Watch this.",
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        url: "javascript:alert(1)",
      }),
    ).rejects.toThrow();

    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("requires member access to add a note", async () => {
    mockActor("viewer");

    await expect(
      addSignalNote({ note: "Watch this.", projectId: "prj_abcdefghijklmnopqrstuvwx" }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("adds a scoped manual note, audits, and revalidates", async () => {
    await addSignalNote({
      keywordId: "kw_abcdefghijklmnopqrstuvwx",
      note: "Launch annotation",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      severity: "warning",
      url: "https://example.com/pricing",
    });

    expect(mocks.prisma.keyword.findFirst).toHaveBeenCalledWith({
      select: { id: true, publicId: true, text: true },
      where: {
        projectId: "project_1",
        publicId: "kw_abcdefghijklmnopqrstuvwx",
      },
    });
    expect(mocks.emitSignal).toHaveBeenCalledWith({
      createdById: "user_1",
      keywordId: "keyword_1",
      payload: { note: "Launch annotation" },
      projectId: "project_1",
      severity: "warning",
      source: "manual",
      type: "note",
      url: "https://example.com/pricing",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "signal.note_added",
        targetId: manualSignal.publicId,
        targetType: "signal",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "timeline"), "page");
  });

  it("rejects notes for keywords outside the project", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue(null);

    await expect(
      addSignalNote({
        keywordId: "kw_bbcdefghijklmnopqrstuvwx",
        note: "Wrong project",
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    ).rejects.toThrow("Keyword not found");
    expect(mocks.emitSignal).not.toHaveBeenCalled();
  });

  it("deletes only manual note signals", async () => {
    mocks.prisma.signal.findFirst.mockResolvedValue({
      ...manualSignal,
      source: "rank_tracker",
      type: "ranking.changed",
    });

    await expect(
      removeSignalNote({
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        signalId: manualSignal.publicId,
      }),
    ).rejects.toThrow("Only manual notes can be removed.");
    expect(mocks.prisma.signal.delete).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("removes a manual note, audits, and revalidates", async () => {
    await removeSignalNote({
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      signalId: manualSignal.publicId,
    });

    expect(mocks.prisma.signal.findFirst).toHaveBeenCalledWith({
      select: {
        id: true,
        keywordId: true,
        payload: true,
        publicId: true,
        severity: true,
        source: true,
        type: true,
        url: true,
      },
      where: { projectId: "project_1", publicId: manualSignal.publicId },
    });
    expect(mocks.prisma.signal.delete).toHaveBeenCalledWith({ where: { id: "signal_1" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "signal.note_removed",
        before: expect.objectContaining({ id: manualSignal.publicId }),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "timeline"), "page");
  });
});
