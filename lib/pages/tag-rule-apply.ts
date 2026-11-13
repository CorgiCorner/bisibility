import "server-only";

import { prisma } from "@/lib/db/prisma";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { pagePathForProject } from "./page-path";
import { matchPagesForRule, type TagRulePage, type TagRuleShape } from "./tag-pattern";

const READ_CHUNK = 1_000;
const WRITE_CHUNK = 500;
const MAX_PAGES = 50_000;
const MAX_AUTO_JOIN_RULES = 100;

export type TagRuleApplyResult = {
  added: number;
  keywordsTagged: number;
  matched: number;
  removed: number;
};

type StoredRule = TagRuleShape & { tagTargetingKeywords: boolean };

function sitemapUrls(detail: unknown) {
  if (!detail || typeof detail !== "object" || !("sitemapUrls" in detail)) return [];
  const urls = detail.sitemapUrls;
  return Array.isArray(urls) ? urls.filter((url): url is string => typeof url === "string") : [];
}

export async function loadRulePages(projectId: string): Promise<TagRulePage[]> {
  const pages: TagRulePage[] = [];
  let cursor: string | undefined;
  while (pages.length < MAX_PAGES) {
    const rows = await prisma.projectPage.findMany({
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: "asc" },
      select: {
        id: true,
        path: true,
        sources: { select: { detail: true }, where: { source: "sitemap" } },
      },
      skip: cursor ? 1 : 0,
      take: READ_CHUNK,
      where: { projectId },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      pages.push({
        id: row.id,
        path: row.path,
        sitemapUrls: sitemapUrls(row.sources[0]?.detail),
      });
    }
    cursor = rows.at(-1)?.id;
    if (rows.length < READ_CHUNK) break;
  }
  return pages;
}

async function existingLinks(tagId: string) {
  const links: { id: string; origin: "manual" | "rule"; pageId: string }[] = [];
  let cursor: string | undefined;
  while (links.length < MAX_PAGES) {
    const rows = await prisma.pageTag.findMany({
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: "asc" },
      select: { id: true, origin: true, pageId: true },
      skip: cursor ? 1 : 0,
      take: READ_CHUNK,
      where: { tagId },
    });
    if (rows.length === 0) break;
    links.push(...rows);
    cursor = rows.at(-1)?.id;
    if (rows.length < READ_CHUNK) break;
  }
  return links;
}

async function writeDiff(
  tagId: string,
  addPageIds: readonly string[],
  removeIds: readonly string[],
) {
  let added = 0;
  let removed = 0;
  for (let index = 0; index < addPageIds.length; index += WRITE_CHUNK) {
    const chunk = addPageIds.slice(index, index + WRITE_CHUNK);
    const result = await prisma.pageTag.createMany({
      data: chunk.map((pageId) => ({ origin: "rule" as const, pageId, tagId })),
      skipDuplicates: true,
    });
    added += result.count;
  }
  for (let index = 0; index < removeIds.length; index += WRITE_CHUNK) {
    const result = await prisma.pageTag.deleteMany({
      where: { id: { in: removeIds.slice(index, index + WRITE_CHUNK) }, origin: "rule", tagId },
    });
    removed += result.count;
  }
  return { added, removed };
}

async function tagKeywords(
  tagId: string,
  projectId: string,
  domain: string,
  taggedPaths: ReadonlySet<string>,
) {
  let keywordsTagged = 0;
  let cursor: string | undefined;
  while (keywordsTagged < MAX_PAGES) {
    const keywords = await prisma.keyword.findMany({
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: "asc" },
      select: { id: true, targetUrl: true },
      skip: cursor ? 1 : 0,
      take: READ_CHUNK,
      where: { archivedAt: null, projectId, targetUrl: { not: null } },
    });
    if (keywords.length === 0) break;
    const targets = keywords.flatMap((keyword) => {
      const path = keyword.targetUrl ? pagePathForProject(domain, keyword.targetUrl) : null;
      return path && taggedPaths.has(path) ? [keyword.id] : [];
    });
    if (targets.length > 0) {
      const present = await prisma.keywordTag.findMany({
        select: { keywordId: true },
        where: { keywordId: { in: targets }, tagId },
      });
      const have = new Set(present.map((row) => row.keywordId));
      const missing = targets.filter((keywordId) => !have.has(keywordId));
      if (missing.length > 0) {
        const created = await prisma.keywordTag.createMany({
          data: missing.map((keywordId) => ({ keywordId, tagId })),
          skipDuplicates: true,
        });
        keywordsTagged += created.count;
      }
    }
    cursor = keywords.at(-1)?.id;
    if (keywords.length < READ_CHUNK) break;
  }
  return keywordsTagged;
}

export async function applyTagPageRule(tagId: string): Promise<TagRuleApplyResult> {
  const tag = await prisma.tag.findFirst({
    select: {
      id: true,
      pageRule: {
        select: {
          excludePatterns: true,
          kind: true,
          pattern: true,
          sitemapUrl: true,
          tagTargetingKeywords: true,
          urls: true,
        },
      },
      project: { select: { domain: true, id: true } },
    },
    where: { id: tagId },
  });
  if (!tag?.pageRule) return { added: 0, keywordsTagged: 0, matched: 0, removed: 0 };
  const rule: StoredRule = tag.pageRule;
  const pages = await loadRulePages(tag.project.id);
  const matched = matchPagesForRule(rule, pages);
  const matchedIds = new Set(matched.map((page) => page.id));
  const links = await existingLinks(tag.id);
  const linked = new Set(links.map((link) => link.pageId));
  const addPageIds = matched.flatMap((page) => (linked.has(page.id) ? [] : [page.id]));
  const removeIds = links.flatMap((link) =>
    link.origin === "rule" && !matchedIds.has(link.pageId) ? [link.id] : [],
  );
  const written = await writeDiff(tag.id, addPageIds, removeIds);
  let keywordsTagged = 0;
  const domain = trackedProjectDomain(tag.project.domain);
  if (rule.tagTargetingKeywords && domain) {
    const paths = new Map(pages.map((page) => [page.id, page.path]));
    const taggedPaths = new Set<string>();
    for (const link of links) {
      if (link.origin === "manual" || matchedIds.has(link.pageId)) {
        const path = paths.get(link.pageId);
        if (path) taggedPaths.add(path);
      }
    }
    for (const pageId of addPageIds) {
      const path = paths.get(pageId);
      if (path) taggedPaths.add(path);
    }
    keywordsTagged = await tagKeywords(tag.id, tag.project.id, domain, taggedPaths);
  }
  return { ...written, keywordsTagged, matched: matched.length };
}

export async function applyAutoJoinPageTagRules(projectId: string) {
  let applied = 0;
  let failed = 0;
  let rules: { tagId: string }[] = [];
  try {
    rules = await prisma.tagPageRule.findMany({
      select: { tagId: true },
      take: MAX_AUTO_JOIN_RULES,
      where: { autoJoin: true, tag: { projectId } },
    });
  } catch {
    return { applied, failed: 1 };
  }
  for (const rule of rules) {
    try {
      await applyTagPageRule(rule.tagId);
      applied += 1;
    } catch {
      failed += 1;
    }
  }
  return { applied, failed };
}
