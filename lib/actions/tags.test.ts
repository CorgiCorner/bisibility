import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTag, createTagResult, deleteTag, renameTag } from "./tags";

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
    $transaction: vi.fn(),
    keywordTag: { createMany: vi.fn() },
    project: { findFirst: vi.fn() },
    tag: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
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

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const sourceTag = {
  id: "tag_source",
  keywords: [{ keywordId: "keyword_1" }, { keywordId: "keyword_2" }],
  name: "Docs",
  publicId: "tag_abcdefghijklmnopqrstuvwx",
};

function mockActor(role: "admin" | "member" | "owner" | "viewer") {
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role: "member",
  });
}

describe("tag actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mockActor("admin");
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });
  });

  it("renames an existing tag across its keyword links", async () => {
    mocks.prisma.tag.findFirst.mockResolvedValueOnce(sourceTag).mockResolvedValueOnce(null);
    mocks.prisma.tag.update.mockResolvedValue({
      id: "tag_source",
      publicId: sourceTag.publicId,
    });

    const result = await renameTag({
      fromName: "Docs",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      toName: "Guides",
    });

    expect(result).toEqual({ merged: false, renamed: 2 });
    expect(mocks.prisma.tag.update).toHaveBeenCalledWith({
      data: { name: "Guides" },
      select: { id: true, publicId: true },
      where: { id: "tag_source" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tag.rename", targetId: sourceTag.publicId }),
    );
  });

  it("creates a project tag", async () => {
    mocks.prisma.tag.findFirst.mockResolvedValueOnce(null);
    mocks.prisma.tag.create.mockResolvedValue({
      id: "tag_new",
      name: "Guides",
      publicId: "tag_bbcdefghijklmnopqrstuvwx",
    });

    const result = await createTag({ name: "Guides", projectId: "prj_abcdefghijklmnopqrstuvwx" });

    expect(result).toEqual({ created: true });
    expect(mocks.prisma.tag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Guides", projectId: "project_1" }),
      select: { id: true, name: true, publicId: true },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tag.create",
        targetId: "tag_bbcdefghijklmnopqrstuvwx",
      }),
    );
  });

  it("returns a handled 423 result when migration hold blocks tag creation", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      writeMode: "migration_hold",
    });

    await expect(
      createTagResult({ name: "Guides", projectId: "prj_abcdefghijklmnopqrstuvwx" }),
    ).resolves.toMatchObject({
      error: { code: "project_read_only", status: 423 },
      ok: false,
    });

    expect(mocks.prisma.tag.create).not.toHaveBeenCalled();
  });

  it("merges keyword links when renaming to an existing tag", async () => {
    mocks.prisma.tag.findFirst.mockResolvedValueOnce(sourceTag).mockResolvedValueOnce({
      id: "tag_target",
      name: "Product",
      publicId: "tag_cccdefghijklmnopqrstuvwx",
    });

    const result = await renameTag({
      fromName: "Docs",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      toName: "Product",
    });

    expect(result).toEqual({ merged: true, renamed: 2 });
    expect(mocks.prisma.keywordTag.createMany).toHaveBeenCalledWith({
      data: [
        { keywordId: "keyword_1", tagId: "tag_target" },
        { keywordId: "keyword_2", tagId: "tag_target" },
      ],
      skipDuplicates: true,
    });
    expect(mocks.prisma.tag.delete).toHaveBeenCalledWith({ where: { id: "tag_source" } });
  });

  it("deletes a tag from all keywords", async () => {
    mocks.prisma.tag.findFirst.mockResolvedValueOnce(sourceTag);

    const result = await deleteTag({ name: "Docs", projectId: "prj_abcdefghijklmnopqrstuvwx" });

    expect(result).toEqual({ deleted: 2 });
    expect(mocks.prisma.tag.delete).toHaveBeenCalledWith({ where: { id: "tag_source" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tag.delete", targetId: sourceTag.publicId }),
    );
  });

  it("denies tag deletion to plain project members", async () => {
    mockActor("member");

    await expect(
      deleteTag({ name: "Docs", projectId: "prj_abcdefghijklmnopqrstuvwx" }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.tag.delete).not.toHaveBeenCalled();
  });
});
