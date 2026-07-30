import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addManagedCompetitor,
  removeManagedCompetitor,
  renameManagedCompetitor,
} from "./competitors";

const competitorPublicId = "cmp_aaaaaaaaaaaaaaaaaaaaaaaa";
const projectPublicId = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";

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
    competitor: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    project: { findFirst: vi.fn() },
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
    prisma,
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function mockActor(role: "admin" | "member" | "viewer" = "admin") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

describe("competitor actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor();
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: projectPublicId,
    });
    mocks.prisma.competitor.findUnique.mockResolvedValue(null);
    mocks.prisma.competitor.create.mockResolvedValue({
      domain: "competitor.example.com",
      id: "competitor_db_1",
      label: "Competitor",
      publicId: competitorPublicId,
    });
    mocks.writeAudit.mockResolvedValue({});
  });

  it("rejects invalid add input before reading the session", async () => {
    await expect(addManagedCompetitor({ domain: "", projectId: "" })).rejects.toThrow();

    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("adds a normalized managed competitor, audits, and revalidates", async () => {
    await addManagedCompetitor({
      domain: "https://competitor.example.com/path",
      label: "Competitor",
      projectId: projectPublicId,
    });

    expect(mocks.prisma.competitor.findUnique).toHaveBeenCalledWith({
      select: { domain: true, id: true, label: true, publicId: true },
      where: {
        projectId_domain: { domain: "competitor.example.com", projectId: "project_1" },
      },
    });
    expect(mocks.prisma.competitor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domain: "competitor.example.com",
        label: "Competitor",
        projectId: "project_1",
        publicId: expect.stringMatching(/^cmp_[a-z][a-z0-9]{23}$/),
      }),
      select: { domain: true, id: true, label: true, publicId: true },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "competitor.add", targetId: competitorPublicId }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "competitors"), "page");
    await expect(
      addManagedCompetitor({ domain: "second.example.com", projectId: projectPublicId }),
    ).resolves.toEqual({
      domain: "competitor.example.com",
      id: competitorPublicId,
      label: "Competitor",
    });
  });

  it("does not create duplicates for the same project and domain", async () => {
    mocks.prisma.competitor.findUnique.mockResolvedValue({
      domain: "competitor.example.com",
      id: "competitor_db_1",
      label: "Competitor",
      publicId: competitorPublicId,
    });

    await expect(
      addManagedCompetitor({ domain: "competitor.example.com", projectId: projectPublicId }),
    ).rejects.toThrow("already managed");
    expect(mocks.prisma.competitor.create).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("renames only competitors inside the scoped project", async () => {
    mocks.prisma.competitor.findFirst.mockResolvedValue({
      domain: "competitor.example.com",
      id: "competitor_db_1",
      label: "Competitor",
      publicId: competitorPublicId,
    });
    mocks.prisma.competitor.update.mockResolvedValue({
      domain: "competitor.example.com",
      id: "competitor_db_1",
      label: "Competitor EU",
      publicId: competitorPublicId,
    });

    await renameManagedCompetitor({
      competitorId: competitorPublicId,
      label: "Competitor EU",
      projectId: projectPublicId,
    });

    expect(mocks.prisma.competitor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_1", publicId: competitorPublicId } }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "competitor.rename",
        before: expect.objectContaining({ label: "Competitor" }),
      }),
    );
  });

  it("requires admin access to remove a competitor", async () => {
    mockActor("member");

    await expect(
      removeManagedCompetitor({ competitorId: competitorPublicId, projectId: projectPublicId }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);
    expect(mocks.prisma.competitor.delete).not.toHaveBeenCalled();
  });

  it("removes a managed competitor and records the previous state", async () => {
    mocks.prisma.competitor.findFirst.mockResolvedValue({
      domain: "competitor.example.com",
      id: "competitor_db_1",
      label: "Competitor",
      publicId: competitorPublicId,
    });

    await removeManagedCompetitor({
      competitorId: competitorPublicId,
      projectId: projectPublicId,
    });

    expect(mocks.prisma.competitor.delete).toHaveBeenCalledWith({
      where: { id: "competitor_db_1" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "competitor.remove",
        before: {
          domain: "competitor.example.com",
          id: competitorPublicId,
          label: "Competitor",
        },
      }),
    );
  });

  it("rejects raw competitor IDs before querying and never returns a raw primary key", async () => {
    await expect(
      renameManagedCompetitor({
        competitorId: "competitor_db_1",
        label: "Competitor EU",
        projectId: projectPublicId,
      }),
    ).rejects.toThrow("Competitor not found.");

    expect(mocks.prisma.competitor.findFirst).not.toHaveBeenCalled();
  });
});
