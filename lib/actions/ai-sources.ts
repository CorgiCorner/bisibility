"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import type { AiVisibilityQuery } from "@/lib/ai-tracking/ai-visibility-paths";
import { loadAiVisibilitySources } from "@/lib/ai-tracking/queries/sources";
import { classifySourceDomain, isFixedSourceOrigin } from "@/lib/ai-tracking/source-types";
import { writeAudit } from "@/lib/auth/audit";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import {
  type AiSourceActionResult,
  addAiSourcePlanSchema,
  clearAiSourceTypeSchema,
  removeAiSourcePlanSchema,
  setAiSourceTypeSchema,
  sourcePageUrl,
  updateAiSourcePlanSchema,
} from "./ai-sources-input";

const typeSelect = { domain: true, type: true } as const;
const planSelect = { domain: true, note: true, state: true, url: true } as const;

function revalidateSources() {
  revalidatePath(appPath(asProjectRef("[project]"), "ai-visibility"), "page");
}

async function writableProject(projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", projectId, { type: "competitor" });
  return { actor, project };
}

async function sourceContext(projectId: string) {
  const [project, competitors] = await Promise.all([
    prisma.project.findUnique({
      select: { brandExcludedNames: true, domain: true },
      where: { id: projectId },
    }),
    prisma.competitor.findMany({ select: { domain: true }, where: { projectId } }),
  ]);
  if (!project) throw new Error("Project not found.");
  return { competitors, project };
}

function sourceOrigin(domain: string, context: Awaited<ReturnType<typeof sourceContext>>) {
  return classifySourceDomain(domain, {
    competitorDomains: context.competitors.map((competitor) => competitor.domain),
    excludedNames: context.project.brandExcludedNames ?? [],
    override: null,
    ownDomain: context.project.domain,
  }).origin;
}

export async function getAiVisibilitySources(projectRef: string, query: AiVisibilityQuery) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectRef, { type: "competitor" });
  return loadAiVisibilitySources({
    canWrite:
      canProjectAction(getProjectRole(actor, project.id), "update", "competitor") &&
      !isProjectReadOnly(project.writeMode),
    now: new Date(),
    projectId: project.id,
    query,
  });
}

export async function setAiSourceType(input: unknown): Promise<AiSourceActionResult> {
  const data = parseActionInput(setAiSourceTypeSchema, input);
  const { actor, project } = await writableProject(data.projectId);
  const context = await sourceContext(project.id);
  if (isFixedSourceOrigin(sourceOrigin(data.domain, context))) return { ok: false, error: "fixed" };
  await prisma.$transaction(async (tx) => {
    const before = await tx.aiSourceTypeOverride.findUnique({
      select: typeSelect,
      where: { projectId_domain: { domain: data.domain, projectId: project.id } },
    });
    const after = await tx.aiSourceTypeOverride.upsert({
      create: { domain: data.domain, projectId: project.id, setById: actor.id, type: data.type },
      select: typeSelect,
      update: { setById: actor.id, type: data.type },
      where: { projectId_domain: { domain: data.domain, projectId: project.id } },
    });
    await writeAudit(
      {
        action: "ai_source.type.set",
        actorId: actor.id,
        after,
        before,
        projectId: project.id,
        targetId: data.domain,
        targetType: "ai_source",
      },
      tx,
    );
  });
  recordAppAction(actor);
  revalidateSources();
  return { ok: true };
}

export async function clearAiSourceType(input: unknown): Promise<AiSourceActionResult> {
  const data = parseActionInput(clearAiSourceTypeSchema, input);
  const { actor, project } = await writableProject(data.projectId);
  const removed = await prisma.$transaction(async (tx) => {
    const before = await tx.aiSourceTypeOverride.findUnique({
      select: typeSelect,
      where: { projectId_domain: { domain: data.domain, projectId: project.id } },
    });
    if (!before) return false;
    await tx.aiSourceTypeOverride.delete({
      where: { projectId_domain: { domain: data.domain, projectId: project.id } },
    });
    await writeAudit(
      {
        action: "ai_source.type.clear",
        actorId: actor.id,
        after: null,
        before,
        projectId: project.id,
        targetId: data.domain,
        targetType: "ai_source",
      },
      tx,
    );
    return true;
  });
  if (removed) {
    recordAppAction(actor);
    revalidateSources();
  }
  return { ok: true };
}

export async function addAiSourcePlanItem(input: unknown): Promise<AiSourceActionResult> {
  const data = parseActionInput(addAiSourcePlanSchema, input);
  const { actor, project } = await writableProject(data.projectId);
  const page = sourcePageUrl(data.url, data.domain);
  if ("error" in page) return { ok: false, error: "url" };
  const context = await sourceContext(project.id);
  if (isFixedSourceOrigin(sourceOrigin(data.domain, context))) return { ok: false, error: "fixed" };
  const wrote = await prisma.$transaction(async (tx) => {
    const where = { projectId_domain: { domain: data.domain, projectId: project.id } };
    const before = await tx.aiSourcePlanItem.findUnique({ select: planSelect, where });
    if (before && before.state !== "dismissed") return false;
    const after = await tx.aiSourcePlanItem.upsert({
      create: {
        addedById: actor.id,
        domain: data.domain,
        projectId: project.id,
        state: "todo",
        url: page.url,
      },
      select: planSelect,
      update: { addedById: actor.id, state: "todo", ...(page.url ? { url: page.url } : {}) },
      where,
    });
    await writeAudit(
      {
        action: "ai_source.plan.add",
        actorId: actor.id,
        after,
        before,
        projectId: project.id,
        targetId: data.domain,
        targetType: "ai_source",
      },
      tx,
    );
    return true;
  });
  if (wrote) {
    recordAppAction(actor);
    revalidateSources();
  }
  return { ok: true };
}

export async function updateAiSourcePlanItem(input: unknown): Promise<AiSourceActionResult> {
  const data = parseActionInput(updateAiSourcePlanSchema, input);
  const { actor, project } = await writableProject(data.projectId);
  const updated = await prisma.$transaction(async (tx) => {
    const where = { projectId_domain: { domain: data.domain, projectId: project.id } };
    const before = await tx.aiSourcePlanItem.findUnique({ select: planSelect, where });
    if (!before) return false;
    const after = await tx.aiSourcePlanItem.update({
      data: {
        ...(data.note !== undefined ? { note: data.note } : {}),
        ...(data.state ? { state: data.state } : {}),
      },
      select: planSelect,
      where,
    });
    await writeAudit(
      {
        action: "ai_source.plan.update",
        actorId: actor.id,
        after,
        before,
        projectId: project.id,
        targetId: data.domain,
        targetType: "ai_source",
      },
      tx,
    );
    return true;
  });
  if (!updated) return { ok: false, error: "missing" };
  recordAppAction(actor);
  revalidateSources();
  return { ok: true };
}

export async function removeAiSourcePlanItem(input: unknown): Promise<AiSourceActionResult> {
  const data = parseActionInput(removeAiSourcePlanSchema, input);
  const { actor, project } = await writableProject(data.projectId);
  const removed = await prisma.$transaction(async (tx) => {
    const where = { projectId_domain: { domain: data.domain, projectId: project.id } };
    const before = await tx.aiSourcePlanItem.findUnique({ select: planSelect, where });
    if (!before) return false;
    await tx.aiSourcePlanItem.delete({ where });
    await writeAudit(
      {
        action: "ai_source.plan.remove",
        actorId: actor.id,
        after: null,
        before,
        projectId: project.id,
        targetId: data.domain,
        targetType: "ai_source",
      },
      tx,
    );
    return true;
  });
  if (removed) {
    recordAppAction(actor);
    revalidateSources();
  }
  return { ok: true };
}
