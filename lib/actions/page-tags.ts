"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { pagePathForProject, pagePathHash } from "@/lib/pages/page-path";
import { getProjectPageTagView } from "@/lib/pages/tag-queries";
import { applyTagPageRule, loadRulePages } from "@/lib/pages/tag-rule-apply";
import type { TagRuleShape } from "@/lib/pages/tag-rules";
import {
  compileTagPattern,
  matchPagesForRule,
  splitTagRuleLines,
  TAG_RULE_URL_MAX,
} from "@/lib/pages/tag-rules";
import { appPath } from "@/lib/routing/app-path";
import {
  loadPageTagsSchema,
  manualPageTagsSchema,
  previewPageTagRuleSchema,
  removeTagFromPagesSchema,
  savePageTagRuleSchema,
} from "@/lib/schemas/page-tag";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { revalidatePath } from "next/cache";
import {
  getActionActor,
  makePublicId,
  parseActionInput,
  requireProjectScope,
  revalidateKeywordViews,
} from "./_shared";
import { TagPageRuleInputError } from "./page-tag-errors";

function revalidatePages(publicId: string) {
  revalidatePath(appPath(publicId, "pages"));
}

async function actorProject(
  projectRef: string,
  action: "create" | "delete" | "read" | "update",
  allowReadOnly = false,
) {
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    action,
    projectRef,
    { type: "keyword" },
    { allowReadOnly },
  );
  return { actor, project };
}

function canonicalPaths(domain: string | null, lines: readonly string[]) {
  if (lines.length === 0) return [];
  if (!domain) throw new TagPageRuleInputError("invalid_url");
  const paths: string[] = [];
  for (const line of lines) {
    const path = pagePathForProject(domain, line);
    if (!path) throw new TagPageRuleInputError("invalid_url");
    if (!paths.includes(path)) paths.push(path);
  }
  if (paths.length > TAG_RULE_URL_MAX) throw new TagPageRuleInputError("too_many_urls");
  return paths;
}

function canonicalExcludes(patterns: readonly string[]) {
  return patterns.map((pattern) => {
    const compiled = compileTagPattern(pattern);
    if (!compiled.ok) throw new TagPageRuleInputError("invalid_url");
    return compiled.pattern;
  });
}

function ruleShape(
  domain: string | null,
  input: {
    excludePatterns: readonly string[];
    kind: TagRuleShape["kind"];
    pattern: string;
    sitemapUrl: string;
    urls: readonly string[];
  },
): TagRuleShape {
  let pattern: string | null = null;
  if (input.kind === "path_pattern") {
    const compiled = compileTagPattern(input.pattern);
    if (!compiled.ok) throw new TagPageRuleInputError("invalid_url");
    pattern = compiled.pattern;
  }
  return {
    excludePatterns: canonicalExcludes(input.excludePatterns),
    kind: input.kind,
    pattern,
    sitemapUrl: input.kind === "sitemap" ? input.sitemapUrl.trim() : null,
    urls: input.kind === "url_list" ? canonicalPaths(domain, input.urls) : [],
  };
}

async function findTag(projectId: string, input: { tagId?: string; tagName?: string }) {
  if (input.tagId) {
    return prisma.tag.findFirst({
      select: { id: true, name: true, publicId: true },
      where: { OR: [{ id: input.tagId }, { publicId: input.tagId }], projectId },
    });
  }
  if (!input.tagName) return null;
  return prisma.tag.findFirst({
    select: { id: true, name: true, publicId: true },
    where: { name: input.tagName, projectId },
  });
}

export async function loadPageTags(input: unknown) {
  const data = parseActionInput(loadPageTagsSchema, input);
  const { project } = await actorProject(data.projectId, "read", true);
  return getProjectPageTagView(project.id);
}

export async function previewTagPageRule(projectRef: string, draft: unknown) {
  const data = parseActionInput(previewPageTagRuleSchema, {
    ...(typeof draft === "object" && draft ? draft : {}),
    projectId: projectRef,
  });
  const { project } = await actorProject(data.projectId, "read", true);
  const domain = trackedProjectDomain(project.domain);
  const rule = ruleShape(domain, data);
  const matched = matchPagesForRule(rule, await loadRulePages(project.id));
  const sample = matched.slice(0, 5).map((page) => page.path);
  return { sample, total: matched.length, truncated: matched.length > sample.length };
}

export async function saveTagPageRule(projectRef: string, input: unknown) {
  const data = parseActionInput(savePageTagRuleSchema, {
    ...(typeof input === "object" && input ? input : {}),
    projectId: projectRef,
  });
  const { actor, project } = await actorProject(data.projectId, "read", true);
  const existing = await findTag(project.id, data);
  if (data.tagId && !existing) throw new TagPageRuleInputError("tag_not_found");
  await actorProject(data.projectId, existing ? "update" : "create");
  const domain = trackedProjectDomain(project.domain);
  const rule = ruleShape(domain, { ...data, urls: splitTagRuleLines(data.urlsText) });
  const tag =
    existing ??
    (await prisma.tag.create({
      data: { name: data.tagName, projectId: project.id, publicId: makePublicId("tag") },
      select: { id: true, name: true, publicId: true },
    }));
  const stored = {
    autoJoin: data.autoJoin,
    excludePatterns: [...(rule.excludePatterns ?? [])],
    kind: rule.kind,
    pattern: rule.pattern ?? null,
    sitemapUrl: rule.sitemapUrl ?? null,
    tagTargetingKeywords: data.tagTargetingKeywords,
    updatedById: actor.id,
    urls: [...(rule.urls ?? [])],
  };
  await prisma.tagPageRule.upsert({
    create: { ...stored, tagId: tag.id },
    update: stored,
    where: { tagId: tag.id },
  });
  const applied = await applyTagPageRule(tag.id);
  recordAppAction(actor);
  await writeAudit({
    action: "tag.page_rule.save",
    actorId: actor.id,
    after: {
      autoJoin: data.autoJoin,
      created: !existing,
      keywordsTagged: applied.keywordsTagged,
      kind: data.kind,
      name: tag.name,
      pagesAdded: applied.added,
      pagesRemoved: applied.removed,
      tagTargetingKeywords: data.tagTargetingKeywords,
    },
    projectId: project.id,
    targetId: requiredPublicAuditId(tag.publicId, "tag", "Tag"),
    targetType: "tag",
  });
  revalidatePages(project.publicId);
  if (applied.keywordsTagged > 0) revalidateKeywordViews();
  return { tagId: tag.publicId, ...applied };
}

export async function setManualPageTags(projectRef: string, input: unknown) {
  const data = parseActionInput(manualPageTagsSchema, {
    ...(typeof input === "object" && input ? input : {}),
    projectId: projectRef,
  });
  const { actor, project } = await actorProject(data.projectId, "update");
  const tag = await findTag(project.id, { tagId: data.tagId });
  if (!tag) throw new TagPageRuleInputError("tag_not_found");
  const domain = trackedProjectDomain(project.domain);
  const add = canonicalPaths(domain, data.add);
  const remove = canonicalPaths(domain, data.remove);
  const hashes = [...add, ...remove].map((path) => pagePathHash(path));
  const pages = hashes.length
    ? await prisma.projectPage.findMany({
        select: { id: true, path: true },
        where: { pathHash: { in: hashes }, projectId: project.id },
      })
    : [];
  const byPath = new Map(pages.map((page) => [page.path, page.id]));
  const addIds = add.flatMap((path) => {
    const id = byPath.get(path);
    return id ? [id] : [];
  });
  const removeIds = remove.flatMap((path) => {
    const id = byPath.get(path);
    return id ? [id] : [];
  });
  const created = addIds.length
    ? await prisma.pageTag.createMany({
        data: addIds.map((pageId) => ({ origin: "manual" as const, pageId, tagId: tag.id })),
        skipDuplicates: true,
      })
    : { count: 0 };
  const deleted = removeIds.length
    ? await prisma.pageTag.deleteMany({
        where: { origin: "manual", pageId: { in: removeIds }, tagId: tag.id },
      })
    : { count: 0 };
  if (created.count > 0 || deleted.count > 0) recordAppAction(actor);
  await writeAudit({
    action: "tag.page_links.set",
    actorId: actor.id,
    after: { added: created.count, name: tag.name, removed: deleted.count },
    projectId: project.id,
    targetId: requiredPublicAuditId(tag.publicId, "tag", "Tag"),
    targetType: "tag",
  });
  revalidatePages(project.publicId);
  return { added: created.count, removed: deleted.count };
}

export async function removeTagFromPages(projectRef: string, tagId: string) {
  const data = parseActionInput(removeTagFromPagesSchema, { projectId: projectRef, tagId });
  const { actor, project } = await actorProject(data.projectId, "delete");
  const tag = await findTag(project.id, { tagId: data.tagId });
  if (!tag) throw new TagPageRuleInputError("tag_not_found");
  const [rule, pages] = await prisma.$transaction([
    prisma.tagPageRule.deleteMany({ where: { tagId: tag.id } }),
    prisma.pageTag.deleteMany({ where: { tagId: tag.id } }),
  ]);
  recordAppAction(actor);
  await writeAudit({
    action: "tag.page_links.remove",
    actorId: actor.id,
    after: { pages: pages.count, ruleRemoved: rule.count > 0 },
    before: { name: tag.name },
    projectId: project.id,
    targetId: requiredPublicAuditId(tag.publicId, "tag", "Tag"),
    targetType: "tag",
  });
  revalidatePages(project.publicId);
  return { pages: pages.count };
}
