import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTag, mergeTagResult } from "./tag-merge";

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
    alertRuleTarget: { deleteMany: vi.fn(), updateMany: vi.fn() },
    keywordTag: { createMany: vi.fn() },
    pageTag: { deleteMany: vi.fn(), updateMany: vi.fn() },
    project: { findFirst: vi.fn() },
    savedView: { findMany: vi.fn(), update: vi.fn() },
    tag: { delete: vi.fn(), findFirst: vi.fn() },
    tagPageRule: { update: vi.fn() },
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
    writeAudit: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
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

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const source = {
  alertTargets: [{ id: "alert_shared", ruleId: "rule_shared" }],
  id: "tag_source",
  keywords: [{ keywordId: "keyword_shared" }],
  name: "Docs",
  pageLinks: [{ pageId: "page_shared" }, { pageId: "page_only" }],
  pageRule: { id: "rule_row" },
  publicId: "tag_sourcedddddddddddddddddd",
};
const target = {
  alertTargets: [{ id: "alert_target", ruleId: "rule_shared" }],
  id: "tag_target",
  keywords: [{ keywordId: "keyword_shared" }],
  name: "Guides",
  pageLinks: [{ pageId: "page_shared" }],
  pageRule: null,
  publicId: "tag_targetdddddddddddddddddd",
};

function mockActor(role: "admin" | "member") {
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role: "member",
  });
}

describe("mergeTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mockActor("admin");
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: projectId,
      writeMode: "active",
    });
    mocks.prisma.tag.findFirst.mockResolvedValueOnce(source).mockResolvedValueOnce(target);
    mocks.prisma.savedView.findMany.mockResolvedValue([
      {
        config: { filters: { tags: ["Docs", "Guides"] }, search: "keep" },
        id: "view_1",
        name: "Both",
        surface: "keywords",
      },
    ]);
  });

  it("moves unique references, drops conflicts, and deletes the source in one transaction", async () => {
    const result = await mergeTag({
      projectId,
      sourceId: source.publicId,
      targetId: target.publicId,
    });

    expect(result.merged).toBe(true);
    expect(mocks.prisma.pageTag.deleteMany).toHaveBeenCalledWith({
      where: { pageId: { in: ["page_shared"] }, tagId: "tag_source" },
    });
    expect(mocks.prisma.pageTag.updateMany).toHaveBeenCalledWith({
      data: { tagId: "tag_target" },
      where: { pageId: { in: ["page_only"] }, tagId: "tag_source" },
    });
    expect(mocks.prisma.keywordTag.createMany).toHaveBeenCalledWith({
      data: [{ keywordId: "keyword_shared", tagId: "tag_target" }],
      skipDuplicates: true,
    });
    expect(mocks.prisma.alertRuleTarget.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["alert_shared"] } },
    });
    expect(mocks.prisma.alertRuleTarget.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.tagPageRule.update).toHaveBeenCalledWith({
      data: { tagId: "tag_target" },
      where: { tagId: "tag_source" },
    });
    expect(mocks.prisma.savedView.update).toHaveBeenCalledWith({
      data: { config: { filters: { tags: ["Guides"] }, search: "keep" } },
      where: { id: "view_1" },
    });
    expect(mocks.prisma.tag.delete).toHaveBeenCalledWith({ where: { id: "tag_source" } });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tag.merge",
        after: expect.objectContaining({ name: "Guides", pages: 2, ruleMoved: true }),
        before: { name: "Docs" },
        targetId: target.publicId,
      }),
    );
  });

  it("returns a handled miss when the target tag is gone", async () => {
    mocks.prisma.tag.findFirst.mockReset();
    mocks.prisma.tag.findFirst.mockResolvedValueOnce(source).mockResolvedValueOnce(null);

    await expect(
      mergeTagResult({ projectId, sourceId: source.publicId, targetId: "tag_missing" }),
    ).resolves.toMatchObject({
      error: { code: "not_found", status: 404 },
      ok: false,
    });
    expect(mocks.prisma.tag.delete).not.toHaveBeenCalled();
  });

  it("denies a merge to a project member", async () => {
    mockActor("member");

    await expect(
      mergeTag({ projectId, sourceId: source.publicId, targetId: target.publicId }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
