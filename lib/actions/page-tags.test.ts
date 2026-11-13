import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPageTags,
  previewTagPageRule,
  removeTagFromPages,
  saveTagPageRule,
  setManualPageTags,
} from "./page-tags";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  apply: vi.fn(),
  block: null as string | null,
  pages: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    pageTag: { createMany: vi.fn(), deleteMany: vi.fn() },
    projectPage: { findMany: vi.fn() },
    tag: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    tagPageRule: { deleteMany: vi.fn(), upsert: vi.fn() },
  },
  record: vi.fn(),
  requireScope: vi.fn(),
  revalidateKeywords: vi.fn(),
  tags: vi.fn(),
  writeAudit: vi.fn(),
}));

const { prisma } = mocks;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/pages/tag-queries", () => ({ getProjectPageTagView: mocks.tags }));
vi.mock("@/lib/pages/tag-rule-apply", () => ({
  applyTagPageRule: mocks.apply,
  loadRulePages: mocks.pages,
}));
vi.mock("./_shared", () => ({
  getActionActor: vi.fn(async () => mocks.actor),
  makePublicId: () => "tag_newpublicid000000000000",
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireScope,
  revalidateKeywordViews: mocks.revalidateKeywords,
}));

const form = {
  autoJoin: true,
  excludePatterns: [] as string[],
  kind: "path_pattern" as const,
  pattern: "/docs",
  sitemapUrl: "",
  tagName: "Docs",
  tagTargetingKeywords: false,
  urlsText: "",
};

describe("page tag actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.block = null;
    mocks.requireScope.mockImplementation(async (_actor, action: string) => {
      if (mocks.block === action) throw new Error(`blocked ${action}`);
      return { domain: "example.com", id: "project_1", publicId: "prj_1" };
    });
    mocks.apply.mockResolvedValue({ added: 1, keywordsTagged: 0, matched: 1, removed: 0 });
    mocks.pages.mockResolvedValue([
      { id: "page_docs", path: "/docs" },
      { id: "page_blog", path: "/blog" },
    ]);
    mocks.tags.mockResolvedValue({
      keywordOnly: [],
      options: [],
      rows: [],
      sitemaps: [],
      tagCount: 0,
    });
    prisma.tag.findFirst.mockResolvedValue(null);
    prisma.tag.create.mockResolvedValue({ id: "tag_1", name: "Docs", publicId: "tag_pub" });
    prisma.tagPageRule.upsert.mockResolvedValue({ id: "rule_1" });
    prisma.projectPage.findMany.mockResolvedValue([
      { id: "page_docs", path: "/docs" },
      { id: "page_blog", path: "/blog" },
    ]);
    prisma.pageTag.createMany.mockResolvedValue({ count: 1 });
    prisma.pageTag.deleteMany.mockResolvedValue({ count: 1 });
    prisma.tagPageRule.deleteMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it("previews with read access and does not write", async () => {
    await expect(previewTagPageRule("prj_1", { ...form, urls: [] })).resolves.toEqual({
      sample: ["/docs"],
      total: 1,
      truncated: false,
    });
    expect(mocks.requireScope).toHaveBeenCalledWith(
      mocks.actor,
      "read",
      "prj_1",
      { type: "keyword" },
      { allowReadOnly: true },
    );
    expect(prisma.tagPageRule.upsert).not.toHaveBeenCalled();
  });

  it("rejects a pattern that does not start with a slash", async () => {
    await expect(saveTagPageRule("prj_1", { ...form, pattern: "docs" })).rejects.toThrow(
      /must_start_with_slash/u,
    );
    expect(prisma.tag.create).not.toHaveBeenCalled();
  });

  it("rejects a viewer and a read-only project before writing", async () => {
    mocks.block = "read";
    await expect(previewTagPageRule("prj_1", { ...form, urls: [] })).rejects.toThrow(
      /blocked read/u,
    );
    mocks.block = "create";
    await expect(saveTagPageRule("prj_1", form)).rejects.toThrow(/blocked create/u);
    expect(prisma.tag.create).not.toHaveBeenCalled();
  });

  it("creates a tag, stores the rule, applies it, and audits the save", async () => {
    await expect(saveTagPageRule("prj_1", form)).resolves.toMatchObject({
      added: 1,
      tagId: "tag_pub",
    });
    expect(mocks.requireScope).toHaveBeenLastCalledWith(
      mocks.actor,
      "create",
      "prj_1",
      { type: "keyword" },
      { allowReadOnly: false },
    );
    expect(prisma.tagPageRule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          autoJoin: true,
          kind: "path_pattern",
          pattern: "/docs",
          tagTargetingKeywords: false,
        }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tag.page_rule.save",
        after: expect.objectContaining({ created: true, name: "Docs", pagesAdded: 1 }),
        targetType: "tag",
      }),
    );
  });

  it("updates an existing tag without creating another", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "tag_1", name: "Docs", publicId: "tag_pub" });
    await saveTagPageRule("prj_1", { ...form, tagId: "tag_pub" });
    expect(mocks.requireScope).toHaveBeenLastCalledWith(
      mocks.actor,
      "update",
      "prj_1",
      { type: "keyword" },
      { allowReadOnly: false },
    );
    expect(prisma.tag.create).not.toHaveBeenCalled();
  });

  it("sets and clears only manual page links", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "tag_1", name: "Docs", publicId: "tag_pub" });
    await setManualPageTags("prj_1", {
      add: ["/docs"],
      remove: ["/blog"],
      tagId: "tag_pub",
    });
    expect(mocks.requireScope).toHaveBeenCalledWith(
      mocks.actor,
      "update",
      "prj_1",
      { type: "keyword" },
      { allowReadOnly: false },
    );
    expect(prisma.pageTag.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ origin: "manual", pageId: "page_docs" })],
      }),
    );
    expect(prisma.pageTag.deleteMany).toHaveBeenCalledWith({
      where: { origin: "manual", pageId: { in: ["page_blog"] }, tagId: "tag_1" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tag.page_links.set" }),
    );
  });

  it("removes page links for an admin and keeps the tag", async () => {
    prisma.tag.findFirst.mockResolvedValue({ id: "tag_1", name: "Docs", publicId: "tag_pub" });
    await expect(removeTagFromPages("prj_1", "tag_pub")).resolves.toEqual({ pages: 1 });
    expect(mocks.requireScope).toHaveBeenCalledWith(
      mocks.actor,
      "delete",
      "prj_1",
      { type: "keyword" },
      { allowReadOnly: false },
    );
    expect(prisma.tag.delete).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tag.page_links.remove",
        before: { name: "Docs" },
      }),
    );
  });

  it("refuses to remove page links without delete permission", async () => {
    mocks.block = "delete";
    await expect(removeTagFromPages("prj_1", "tag_pub")).rejects.toThrow(/blocked delete/u);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("loads the by-tag view for a reader", async () => {
    await loadPageTags({ projectId: "prj_1" });
    expect(mocks.requireScope).toHaveBeenCalledWith(
      mocks.actor,
      "read",
      "prj_1",
      { type: "keyword" },
      { allowReadOnly: true },
    );
    expect(mocks.tags).toHaveBeenCalledWith("project_1");
  });
});
