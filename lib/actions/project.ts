"use server";

import { getProjectDepthDecreaseWarning } from "@/lib/alerts/depth-conflict.server";
import { createProjectRecord } from "@/lib/api/project-service";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { createProjectSchema, projectDefaultsSchema } from "@/lib/schemas/project";
import {
  keywordMarketSelect,
  projectDefaultSerpMarket,
  serpMarketUpdatePlan,
} from "@/lib/serp/default-market";
import { resolveProjectDefaultMarket } from "@/lib/serp/project-default-market";
import {
  projectDefaultsConfig,
  publicProjectDefaults,
} from "@/lib/settings/project-defaults-config";
import { projectDefaultsUpsertArgs } from "@/lib/settings/project-defaults-write";
import { normalizeSchedule } from "./_schedule";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "./_shared";

export async function createProject(input: unknown) {
  const data = parseActionInput(createProjectSchema, input);
  const actor = await getActionActor();
  authorize(actor, "create", { ownerId: actor.id, requiredRole: "member", type: "project" });
  const project = await createProjectRecord(data, actor.id);
  revalidateSettingsViews();

  return {
    domain: project.domain,
    id: project.publicId,
    name: project.name,
    publicId: project.publicId,
    trackingScope: project.trackingScope,
  };
}

export async function updateProjectDefaults(input: unknown) {
  const data = parseActionInput(projectDefaultsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const [before, keywords] = await Promise.all([
    prisma.projectDefaults.findUnique({
      where: { projectId: project.id },
    }),
    prisma.keyword.findMany({
      select: keywordMarketSelect,
      where: { projectId: project.id },
    }),
  ]);
  const schedule = normalizeSchedule(data);
  const warning = await getProjectDepthDecreaseWarning(project.id, data.serpDepth);
  const resolvedDefault = await resolveProjectDefaultMarket({ ...data, projectId: project.id });
  const { displayName, locationId, ...market } = resolvedDefault;
  const currentMarket = projectDefaultSerpMarket(before, keywords);
  const marketPlan = serpMarketUpdatePlan(keywords, resolvedDefault, currentMarket);
  const defaults = await prisma.$transaction(async (tx) => {
    const stored = await tx.projectDefaults.upsert(
      projectDefaultsUpsertArgs({
        defaults: { ...schedule, ...market },
        projectId: project.id,
        serpStopOnMatch: data.serpStopOnMatch,
      }),
    );
    if (marketPlan.updateIds.length > 0) {
      await tx.keyword.updateMany({
        data: {
          device: market.device,
          location: displayName,
          locationId,
        },
        where: { id: { in: marketPlan.updateIds } },
      });
    }
    await refreshKeywordDispatchStates({ inheritedProjectId: project.id }, tx);
    return stored;
  });

  await writeAudit({
    action: "project_defaults.update",
    actorId: actor.id,
    after: {
      market,
      movedKeywords: marketPlan.updateIds.length,
      schedule: projectDefaultsConfig(defaults),
      skippedConflicts: marketPlan.skipped,
    },
    before: {
      market: currentMarket,
      schedule: before ? projectDefaultsConfig(before) : null,
    },
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project_defaults",
  });
  revalidateSettingsViews();

  return { ...publicProjectDefaults(defaults, project.publicId), warning };
}

export async function readProjectSettingsSnapshot(projectId: string) {
  return prisma.project.findUnique({
    select: { domain: true, name: true, publicId: true, trackingScope: true },
    where: { id: projectId },
  });
}

export async function updateProjectSettingsSnapshot(
  projectId: string,
  data: { domain: string; name: string },
) {
  return prisma.project.update({
    data: { domain: data.domain, name: data.name },
    select: { domain: true, name: true, publicId: true, trackingScope: true },
    where: { id: projectId },
  });
}

export async function readProjectDeleteSnapshot(projectId: string) {
  return prisma.project.findUnique({
    select: {
      _count: {
        select: { apiKeys: true, keywords: true, members: true, providerConnections: true },
      },
      domain: true,
      name: true,
      publicId: true,
    },
    where: { id: projectId },
  });
}

export async function deleteProjectById(projectId: string) {
  return prisma.project.delete({ where: { id: projectId } });
}

export async function readActorProjects(actorId: string) {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, publicId: true },
    where: { members: { some: { userId: actorId } } },
  });

  return projects;
}
