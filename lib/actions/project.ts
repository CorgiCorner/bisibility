"use server";

import { normalizeSchedule } from "@/lib/actions/_schedule";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { getProjectDepthDecreaseWarning } from "@/lib/alerts/depth-conflict.server";
import { readConsentFromCookies, trackServerEvent } from "@/lib/analytics/server";
import { createProjectRecord } from "@/lib/api/project-service";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { createProjectSchema, projectDefaultsSchema } from "@/lib/schemas/project";
import { keywordMarketSelect, projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { resolveProjectDefaultMarket } from "@/lib/serp/project-default-market";
import {
  projectDefaultsConfig,
  publicProjectDefaults,
} from "@/lib/settings/project-defaults-config";
import { projectDefaultsUpsertArgs } from "@/lib/settings/project-defaults-write";
import { z } from "zod";

const completeProjectOnboardingSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
});

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

export async function completeProjectOnboarding(input: unknown) {
  const data = parseActionInput(completeProjectOnboardingSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const result = await prisma.project.updateMany({
    data: { onboardingCompletedAt: new Date() },
    where: { id: project.id, onboardingCompletedAt: null },
  });

  if (result.count === 1) {
    const [providerCount, keywordCount, firstCheckCount] = await Promise.all([
      prisma.providerConnection.count({
        where: { enabled: true, kind: "serp", projectId: project.id, status: "connected" },
      }),
      prisma.keyword.count({ where: { projectId: project.id } }),
      prisma.rankCheckRun.count({ where: { projectId: project.id } }),
    ]);
    await trackServerEvent("onboarding_completed", {
      consent: await readConsentFromCookies(),
      distinctId: actor.id,
      properties: {
        first_check_ran: firstCheckCount > 0,
        has_provider: providerCount > 0,
        keyword_count: keywordCount,
      },
    });
  }

  return { completed: result.count === 1 };
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
  const market = {
    city: resolvedDefault.city,
    country: resolvedDefault.country,
    device: resolvedDefault.device,
    locationKey: resolvedDefault.locationKey,
  };
  const currentMarket = projectDefaultSerpMarket(before, keywords);
  const defaults = await prisma.$transaction(async (tx) => {
    const stored = await tx.projectDefaults.upsert(
      projectDefaultsUpsertArgs({
        defaults: { ...schedule, ...market },
        projectId: project.id,
        serpStopOnMatch: data.serpStopOnMatch,
      }),
    );
    await refreshKeywordDispatchStates({ inheritedProjectId: project.id }, tx);
    return stored;
  });

  await writeAudit({
    action: "project_defaults.update",
    actorId: actor.id,
    after: {
      market,
      schedule: projectDefaultsConfig(defaults),
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
