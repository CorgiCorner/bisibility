import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyAutoJoinPageTagRules, applyTagPageRule } from "./tag-rule-apply";

type Link = { id: string; origin: "manual" | "rule"; pageId: string; tagId: string };

const state = {
  keywords: [{ id: "kw_docs", targetUrl: "https://example.com/docs" }] as {
    id: string;
    targetUrl: string | null;
  }[],
  links: [] as Link[],
  pages: [
    { id: "page_docs", path: "/docs", sources: [] as { detail: unknown }[] },
    { id: "page_blog", path: "/blog", sources: [] },
  ],
  pattern: "/docs",
  tagKeywords: false,
};

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { findMany: vi.fn() },
    keywordTag: { createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    pageTag: { createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
    projectPage: { findMany: vi.fn() },
    tag: { findFirst: vi.fn() },
    tagPageRule: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const { prisma } = mocks;

function ruleFor(tagId: string) {
  return {
    id: tagId,
    pageRule: {
      excludePatterns: [],
      kind: "path_pattern" as const,
      pattern: state.pattern,
      sitemapUrl: null,
      tagTargetingKeywords: state.tagKeywords,
      urls: [],
    },
    project: { domain: "example.com", id: "project_1" },
  };
}

describe("applyTagPageRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.links = [{ id: "link_manual", origin: "manual", pageId: "page_blog", tagId: "tag_1" }];
    state.pages = [
      { id: "page_docs", path: "/docs", sources: [] },
      { id: "page_blog", path: "/blog", sources: [] },
    ];
    state.pattern = "/docs";
    state.tagKeywords = false;
    prisma.projectPage.findMany.mockImplementation(async () => state.pages);
    prisma.pageTag.findMany.mockImplementation(async () => state.links);
    prisma.pageTag.createMany.mockImplementation(
      async ({ data }: { data: { pageId: string; tagId: string }[] }) => {
        for (const row of data) {
          state.links.push({
            id: `link_${row.pageId}`,
            origin: "rule",
            pageId: row.pageId,
            tagId: row.tagId,
          });
        }
        return { count: data.length };
      },
    );
    prisma.pageTag.deleteMany.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) => {
        const ids = new Set(where.id.in);
        const before = state.links.length;
        state.links = state.links.filter((link) => !ids.has(link.id));
        return { count: before - state.links.length };
      },
    );
    prisma.tag.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "tag_bad") throw new Error("rule failed");
      return ruleFor(where.id);
    });
    prisma.keyword.findMany.mockResolvedValue(state.keywords);
    prisma.keywordTag.findMany.mockResolvedValue([]);
    prisma.keywordTag.createMany.mockResolvedValue({ count: 1 });
  });

  it("tags matching pages, stays put on a second save, and keeps manual links", async () => {
    await expect(applyTagPageRule("tag_1")).resolves.toMatchObject({
      added: 1,
      matched: 1,
      removed: 0,
    });
    prisma.pageTag.createMany.mockClear();
    prisma.pageTag.deleteMany.mockClear();
    await expect(applyTagPageRule("tag_1")).resolves.toMatchObject({
      added: 0,
      matched: 1,
      removed: 0,
    });
    expect(prisma.pageTag.createMany).not.toHaveBeenCalled();
    expect(prisma.pageTag.deleteMany).not.toHaveBeenCalled();
    expect(state.links.map((link) => link.id).sort()).toEqual(["link_manual", "link_page_docs"]);

    state.pattern = "/missing";
    await applyTagPageRule("tag_1");
    expect(state.links.map((link) => [link.id, link.origin])).toEqual([["link_manual", "manual"]]);
    expect(prisma.keywordTag.deleteMany).not.toHaveBeenCalled();
  });

  it("joins a page that appears later and only adds keyword tags", async () => {
    await applyTagPageRule("tag_1");
    state.pages.push({ id: "page_new", path: "/docs", sources: [] });
    state.pattern = "/{slug}";
    state.tagKeywords = true;
    const result = await applyTagPageRule("tag_1");
    expect(result.added).toBeGreaterThan(0);
    expect(state.links.some((link) => link.pageId === "page_new" && link.origin === "rule")).toBe(
      true,
    );
    expect(state.links.some((link) => link.origin === "manual")).toBe(true);
    expect(prisma.keywordTag.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ keywordId: "kw_docs", tagId: "tag_1" })],
      }),
    );
    expect(prisma.keywordTag.deleteMany).not.toHaveBeenCalled();
  });

  it("isolates a failing auto-join rule", async () => {
    prisma.tagPageRule.findMany.mockResolvedValue([{ tagId: "tag_1" }, { tagId: "tag_bad" }]);
    await expect(applyAutoJoinPageTagRules("project_1")).resolves.toEqual({
      applied: 1,
      failed: 1,
    });
    prisma.tagPageRule.findMany.mockRejectedValue(new Error("missing table"));
    await expect(applyAutoJoinPageTagRules("project_1")).resolves.toEqual({
      applied: 0,
      failed: 1,
    });
  });
});
