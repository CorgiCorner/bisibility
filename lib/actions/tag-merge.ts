"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { type MergeTagRecord, planTagMerge } from "@/lib/queries/tag-merge-plan";
import { appPath } from "@/lib/routing/app-path";
import { mergeTagSchema } from "@/lib/schemas/tag";
import { revalidatePath } from "next/cache";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateKeywordViews,
} from "./_shared";
import { handledActionResult } from "./action-result";
import { TagNotFoundError } from "./tag-errors";

const tagSelect = {
  alertTargets: { select: { id: true, ruleId: true } },
  id: true,
  keywords: { select: { keywordId: true } },
  name: true,
  pageLinks: { select: { pageId: true } },
  pageRule: { select: { id: true } },
  publicId: true,
} as const;

type SelectedTag = {
  alertTargets: { id: string; ruleId: string }[];
  id: string;
  keywords: { keywordId: string }[];
  name: string;
  pageLinks: { pageId: string }[];
  pageRule: { id: string } | null;
  publicId: string;
};

function asRecord(tag: SelectedTag): MergeTagRecord {
  return {
    alertTargets: tag.alertTargets,
    id: tag.id,
    keywordIds: tag.keywords.map((row) => row.keywordId),
    name: tag.name,
    pageIds: tag.pageLinks.map((row) => row.pageId),
    ruleId: tag.pageRule?.id ?? null,
  };
}

function revalidateMergedTag(projectPublicId: string) {
  revalidateKeywordViews();
  revalidatePath(appPath(projectPublicId, "pages"));
  revalidatePath(appPath(projectPublicId, "settings", "tags"));
}

export async function mergeTag(input: unknown) {
  const data = parseActionInput(mergeTagSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "delete", data.projectId, { type: "keyword" });
  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.tag.findFirst({
      select: tagSelect,
      where: { OR: [{ id: data.sourceId }, { publicId: data.sourceId }], projectId: project.id },
    });
    if (!source) throw new TagNotFoundError();
    const target = await tx.tag.findFirst({
      select: tagSelect,
      where: {
        OR: [{ id: data.targetId }, { publicId: data.targetId }],
        id: { not: source.id },
        projectId: project.id,
      },
    });
    if (!target) throw new TagNotFoundError();
    const views = await tx.savedView.findMany({
      select: { config: true, id: true, name: true, surface: true },
      where: { projectId: project.id },
    });
    const plan = planTagMerge(asRecord(source), asRecord(target), views);
    if (plan.pageLinksToDrop.length > 0) {
      await tx.pageTag.deleteMany({
        where: { pageId: { in: plan.pageLinksToDrop }, tagId: source.id },
      });
    }
    if (plan.pageLinksToMove.length > 0) {
      await tx.pageTag.updateMany({
        data: { tagId: target.id },
        where: { pageId: { in: plan.pageLinksToMove }, tagId: source.id },
      });
    }
    if (plan.moveRule) {
      await tx.tagPageRule.update({ data: { tagId: target.id }, where: { tagId: source.id } });
    }
    if (plan.keywordIds.length > 0) {
      await tx.keywordTag.createMany({
        data: plan.keywordIds.map((keywordId) => ({ keywordId, tagId: target.id })),
        skipDuplicates: true,
      });
    }
    if (plan.alertTargetsToDrop.length > 0) {
      await tx.alertRuleTarget.deleteMany({ where: { id: { in: plan.alertTargetsToDrop } } });
    }
    if (plan.alertTargetsToMove.length > 0) {
      await tx.alertRuleTarget.updateMany({
        data: { tagId: target.id },
        where: { id: { in: plan.alertTargetsToMove } },
      });
    }
    for (const update of plan.savedViewUpdates) {
      await tx.savedView.update({
        data: { config: update.config as never },
        where: { id: update.id },
      });
    }
    await tx.tag.delete({ where: { id: source.id } });
    return { plan, sourceName: source.name, target };
  });

  recordAppAction(actor);
  await writeAudit({
    action: "tag.merge",
    actorId: actor.id,
    after: {
      alerts: result.plan.counts.alerts,
      keywordSegments: result.plan.counts.keywordSegments,
      keywords: result.plan.counts.keywords,
      name: result.target.name,
      pages: result.plan.counts.pages,
      ruleMoved: result.plan.moveRule,
      savedViews: result.plan.counts.savedViews,
    },
    before: { name: result.sourceName },
    projectId: project.id,
    targetId: requiredPublicAuditId(result.target.publicId, "tag", "Tag"),
    targetType: "tag",
  });
  revalidateMergedTag(project.publicId);
  return { merged: true as const, ...result.plan.counts };
}

export async function mergeTagResult(input: unknown) {
  return handledActionResult(() => mergeTag(input));
}
