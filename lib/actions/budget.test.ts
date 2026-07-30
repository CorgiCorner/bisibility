import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateWorkspaceBudgetAction } from "./budget";

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

  return {
    AuthorizationError,
    authorize: vi.fn((actor, action, resource) => {
      if (!actor) {
        throw new AuthorizationError("unauthenticated");
      }
      const role = actor.memberships?.find(
        (item: { projectId: string }) => item.projectId === resource.projectId,
      )?.role;
      const requiredRole = (resource.requiredRole ??
        minimumRoleByAction[action as keyof typeof minimumRoleByAction]) as keyof typeof roleRank;
      if (!role || roleRank[role as keyof typeof roleRank] < roleRank[requiredRole]) {
        throw new AuthorizationError("forbidden");
      }
      return { actorId: actor.id, projectId: resource.projectId, role };
    }),
    prisma: {
      project: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      user: { findUnique: vi.fn() },
    },
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function mockActor(role: "admin" | "member" | "owner" | "viewer") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role: null,
  });
}

describe("updateWorkspaceBudgetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_a00000000000000000000000",
      writeMode: "active",
      writeModeChangedAt: null,
      writeModeChangedById: null,
    });
    mocks.prisma.project.findUnique.mockResolvedValue({ budgetCapCents: 5_000 });
    mocks.prisma.project.update.mockResolvedValue({ budgetCapCents: 7_500 });
  });

  it("persists the new cap and returns it for an admin", async () => {
    mockActor("admin");

    await expect(
      updateWorkspaceBudgetAction({ capCents: 7_500, projectId: "prj_a00000000000000000000000" }),
    ).resolves.toEqual({ capCents: 7_500 });

    expect(mocks.prisma.project.update).toHaveBeenCalledWith({
      data: { budgetCapCents: 7_500 },
      select: { budgetCapCents: true },
      where: { id: "project_1" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "overview"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "settings"), "page");
  });

  it("writes an audit entry with the old and new cap", async () => {
    mockActor("owner");

    await updateWorkspaceBudgetAction({
      capCents: 7_500,
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "settings.budget_updated",
      actorId: "user_1",
      after: { capCents: 7_500 },
      before: { capCents: 5_000 },
      projectId: "project_1",
      targetId: "prj_a00000000000000000000000",
      targetType: "project",
    });
  });

  it("rejects members without touching the cap", async () => {
    mockActor("member");

    await expect(
      updateWorkspaceBudgetAction({ capCents: 7_500, projectId: "prj_a00000000000000000000000" }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);

    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects viewers without touching the cap", async () => {
    mockActor("viewer");

    await expect(
      updateWorkspaceBudgetAction({ capCents: 7_500, projectId: "prj_a00000000000000000000000" }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);

    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
  });

  it("rejects non-positive, fractional, and oversized caps", async () => {
    mockActor("owner");

    await expect(
      updateWorkspaceBudgetAction({ capCents: 0, projectId: "prj_a00000000000000000000000" }),
    ).rejects.toThrow();
    await expect(
      updateWorkspaceBudgetAction({ capCents: 12.5, projectId: "prj_a00000000000000000000000" }),
    ).rejects.toThrow();
    await expect(
      updateWorkspaceBudgetAction({
        capCents: 100_000_001,
        projectId: "prj_a00000000000000000000000",
      }),
    ).rejects.toThrow();

    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
  });
});
