"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import type { ProjectBrandNamesView } from "@/lib/ai-tracking/brand-name-projection";
import { projectBrandNameCounts } from "@/lib/ai-tracking/brand-name-projection";
import {
  BRAND_NAME_OVERLAP_MESSAGE,
  brandNameDraftSchema,
  brandNameFields,
  brandNameIdentityConflict,
} from "@/lib/ai-tracking/brand-name-schema";
import { suggestBrandNames } from "@/lib/ai-tracking/brand-name-suggestions";
import { canWriteAiTracking } from "@/lib/ai-tracking/projections/schedule-list";
import { listStoredBrandAnswers } from "@/lib/ai-tracking/queries/brand-name-answers";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { getProjectRole } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const reference = <Prefix extends "cmp" | "prj">(prefix: Prefix) =>
  z
    .string()
    .trim()
    .refine((value) => isPublicIdOfType(value, prefix), `Use a ${prefix}_ reference.`);

const previewBrandNamesSchema = z
  .object({
    ...brandNameFields,
    entityId: reference("cmp").optional(),
    entityKind: z.enum(["competitor", "project"]).default("project"),
    from: z.string().datetime().optional(),
    projectId: reference("prj"),
    to: z.string().datetime().optional(),
  })
  .superRefine((value, context) => {
    const separated = brandNameDraftSchema.safeParse(value);
    for (const issue of separated.success ? [] : separated.error.issues) {
      if (issue.message === BRAND_NAME_OVERLAP_MESSAGE) {
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
      }
    }
    if (value.entityKind === "competitor" && !value.entityId) {
      context.addIssue({ code: "custom", message: "Use a cmp_ reference.", path: ["entityId"] });
    }
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({ code: "custom", message: "The date window is reversed.", path: ["to"] });
    }
  });

const updateProjectBrandNamesSchema = z
  .object({
    ...brandNameFields,
    projectId: reference("prj"),
  })
  .superRefine((value, context) => {
    const separated = brandNameDraftSchema.safeParse(value);
    if (separated.success) return;
    for (const issue of separated.error.issues) {
      context.addIssue({ code: "custom", message: issue.message, path: issue.path });
    }
  });

function revalidateBrandNames() {
  revalidatePath(appPath(asProjectRef("[project]"), "ai-visibility"), "page");
  revalidatePath(appPath(asProjectRef("[project]"), "settings", "audit"), "page");
}

function answerWindow(input: { from?: string; to?: string }) {
  if (!input.from && !input.to) return undefined;
  return {
    ...(input.from ? { from: new Date(input.from) } : {}),
    ...(input.to ? { to: new Date(input.to) } : {}),
  };
}

async function draftIdentity(
  projectId: string,
  entity: { entityId?: string; entityKind: "competitor" | "project" },
) {
  if (entity.entityKind === "competitor") {
    const competitor = await prisma.competitor.findFirst({
      select: { domain: true, label: true },
      where: { projectId, publicId: entity.entityId },
    });
    if (!competitor) throw new Error("Competitor not found.");
    return { domain: competitor.domain, label: competitor.label ?? competitor.domain };
  }
  const project = await prisma.project.findUniqueOrThrow({
    select: { domain: true, name: true },
    where: { id: projectId },
  });
  return { domain: project.domain, label: project.name };
}

export async function getProjectBrandNames(projectId: string): Promise<ProjectBrandNamesView> {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "competitor" });
  const row = await prisma.project.findUniqueOrThrow({
    select: {
      brandAliases: true,
      brandExcludedNames: true,
      domain: true,
      name: true,
    },
    where: { id: project.id },
  });
  const aliases = row.brandAliases ?? [];
  const excludedNames = row.brandExcludedNames ?? [];
  const [answers, keywords] = await Promise.all([
    listStoredBrandAnswers(project.id),
    prisma.keyword.findMany({
      distinct: ["text"],
      orderBy: { text: "asc" },
      select: { text: true },
      take: 50,
      where: {
        archivedAt: null,
        projectId: project.id,
        text: { contains: row.name, mode: "insensitive" },
      },
    }),
  ]);
  const suggestions = suggestBrandNames({
    aliases,
    domain: row.domain,
    excludedNames,
    includeKeywords: true,
    keywordTexts: keywords.map((keyword) => keyword.text),
    label: row.name,
  });
  return {
    aliases,
    canWrite: canWriteAiTracking(getProjectRole(actor, project.id), project.writeMode),
    counts: projectBrandNameCounts(answers, {
      aliases,
      domain: row.domain,
      excludedNames,
      label: row.name,
    }),
    domain: row.domain,
    domainSuggestion: suggestions.domainSuggestion,
    excludedNames,
    keywordSuggestions: suggestions.keywordSuggestions,
    label: row.name,
    projectId: project.publicId,
  };
}

export async function previewBrandNames(input: unknown) {
  const data = parseActionInput(previewBrandNamesSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "competitor" });
  const identity = await draftIdentity(project.id, data);
  const conflict = brandNameIdentityConflict(data.excludedNames, identity);
  if (conflict) throw new Error(conflict);
  const answers = await listStoredBrandAnswers(project.id, answerWindow(data));
  return projectBrandNameCounts(answers, { ...identity, ...data });
}

export async function updateProjectBrandNames(input: unknown) {
  const data = parseActionInput(updateProjectBrandNamesSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "competitor",
  });
  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.project.findUniqueOrThrow({
      select: { brandAliases: true, brandExcludedNames: true, domain: true, name: true },
      where: { id: project.id },
    });
    const conflict = brandNameIdentityConflict(data.excludedNames, {
      domain: before.domain,
      label: before.name,
    });
    if (conflict) throw new Error(conflict);
    await tx.project.update({
      data: { brandAliases: data.aliases, brandExcludedNames: data.excludedNames },
      where: { id: project.id },
    });
    const after = { brandAliases: data.aliases, brandExcludedNames: data.excludedNames };
    await writeAudit(
      {
        action: "project.brand_names.update",
        actorId: actor.id,
        after,
        before: {
          brandAliases: before.brandAliases ?? [],
          brandExcludedNames: before.brandExcludedNames ?? [],
        },
        projectId: project.id,
        targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
        targetType: "project",
      },
      tx,
    );
    return after;
  });
  recordAppAction(actor);
  revalidateBrandNames();
  return result;
}
