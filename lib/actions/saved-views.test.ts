import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSavedView, deleteSavedView } from "./saved-views";

const VIEW_PUBLIC_ID = "viw_abcdefghijklmnopqrstuvwx";
const VIEW_PUBLIC_ID_2 = "viw_bbcdefghijklmnopqrstuvwx";

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
    project: { findFirst: vi.fn() },
    savedView: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  };

  return {
    AuthorizationError,
    authorize: vi.fn((actor, action, resource) => {
      if (!actor) throw new AuthorizationError("unauthenticated");
      const role = actor.memberships?.find(
        (item: { projectId: string }) => item.projectId === resource.projectId,
      )?.role;
      const requiredRole =
        resource.requiredRole ?? minimumRoleByAction[action as keyof typeof minimumRoleByAction];
      if (
        !role ||
        roleRank[role as keyof typeof roleRank] < roleRank[requiredRole as keyof typeof roleRank]
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
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const savedConfig = {
  filters: {
    change: "any",
    contains: "",
    country: "all",
    device: "all",
    position: ["top10"],
    serp: [],
    tags: ["Product"],
    volMax: 50,
    volMin: 0,
    wrongUrl: false,
  },
  search: "rank",
} as const;

function mockActor(role: "admin" | "member" | "viewer" = "member") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

function mockProject() {
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    ownerId: "user_1",
    publicId: "prj_abcdefghijklmnopqrstuvwx",
  });
}

describe("saved view actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor();
    mockProject();
    mocks.writeAudit.mockResolvedValue({});
    mocks.prisma.savedView.findFirst.mockResolvedValue(null);
  });

  it("rejects invalid input before reading the session", async () => {
    await expect(
      createSavedView({ config: savedConfig, name: "", projectId: "prj_abcdefghijklmnopqrstuvwx" }),
    ).rejects.toThrow();

    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("creates a project-scoped saved view and audits the mutation", async () => {
    mocks.prisma.savedView.create.mockImplementation(({ data }) =>
      Promise.resolve({
        config: data.config,
        createdAt: new Date("2026-06-28T08:00:00.000Z"),
        createdById: data.createdById,
        id: "view_1",
        name: data.name,
        publicId: VIEW_PUBLIC_ID,
        surface: data.surface,
      }),
    );

    const view = await createSavedView({
      config: savedConfig,
      name: "Product top 10",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(mocks.prisma.savedView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: "user_1",
          name: "Product top 10",
          projectId: "project_1",
          surface: "keywords",
        }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "saved_view.create", targetId: VIEW_PUBLIC_ID }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "keywords"), "page");
    expect(view).toMatchObject({
      canDelete: true,
      id: VIEW_PUBLIC_ID,
      name: "Product top 10",
    });
    expect(view).not.toHaveProperty("createdById");
  });

  it("creates competitor views on their own surface", async () => {
    mocks.prisma.savedView.create.mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        createdAt: new Date("2026-06-28T08:00:00.000Z"),
        id: "view_competitors",
        publicId: VIEW_PUBLIC_ID_2,
      }),
    );

    const view = await createSavedView({
      config: {
        filters: {
          excludedKeywordIds: ["kw_abcdefghijklmnopqrstuvwx"],
          position: "top10",
          tag: null,
        },
        scope: { device: "mobile", engine: "google", locationId: "location_us" },
        surface: "competitors",
        version: 1,
      },
      name: "US mobile",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
    });

    expect(mocks.prisma.savedView.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ surface: "competitors" }) }),
    );
    expect(view).toMatchObject({
      canDelete: true,
      id: VIEW_PUBLIC_ID_2,
      surface: "competitors",
    });
    expect(view).not.toHaveProperty("createdById");
  });

  it("denies creation for project viewers", async () => {
    mockActor("viewer");

    await expect(
      createSavedView({
        config: savedConfig,
        name: "Read only",
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);

    expect(mocks.prisma.savedView.create).not.toHaveBeenCalled();
  });

  it("lets members delete their own saved views", async () => {
    mocks.prisma.savedView.findFirst.mockResolvedValue({
      createdById: "user_1",
      id: "view_1",
      name: "Product top 10",
      publicId: VIEW_PUBLIC_ID,
      surface: "keywords",
    });

    await expect(
      deleteSavedView({
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        viewId: VIEW_PUBLIC_ID,
      }),
    ).resolves.toEqual({ deleted: true });

    expect(mocks.prisma.savedView.findFirst).toHaveBeenCalledWith({
      select: { createdById: true, id: true, name: true, publicId: true, surface: true },
      where: { projectId: "project_1", publicId: VIEW_PUBLIC_ID },
    });
    expect(mocks.prisma.savedView.delete).toHaveBeenCalledWith({ where: { id: "view_1" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "saved_view.delete", targetId: VIEW_PUBLIC_ID }),
    );
  });

  it("denies members deleting another user's saved view", async () => {
    mocks.prisma.savedView.findFirst.mockResolvedValue({
      createdById: "user_2",
      id: "view_2",
      name: "Shared view",
      publicId: VIEW_PUBLIC_ID_2,
      surface: "keywords",
    });

    await expect(
      deleteSavedView({
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        viewId: VIEW_PUBLIC_ID_2,
      }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);

    expect(mocks.prisma.savedView.delete).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("lets admins delete another user's saved view", async () => {
    mockActor("admin");
    mocks.prisma.savedView.findFirst.mockResolvedValue({
      createdById: "user_2",
      id: "view_2",
      name: "Shared view",
      publicId: VIEW_PUBLIC_ID_2,
      surface: "keywords",
    });

    await expect(
      deleteSavedView({
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        viewId: VIEW_PUBLIC_ID_2,
      }),
    ).resolves.toEqual({ deleted: true });

    expect(mocks.prisma.savedView.delete).toHaveBeenCalledWith({ where: { id: "view_2" } });
  });
});
