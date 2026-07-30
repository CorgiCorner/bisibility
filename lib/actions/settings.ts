"use server";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { isBudgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import {
  createProjectSchema,
  normalizeTrackingScope,
  projectDefaultsSchema,
  trackingScopeSchema,
} from "@/lib/schemas/project";
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
import { z } from "zod";
import { normalizeSchedule } from "./_schedule";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateRankCheckViews,
  revalidateSettingsPage,
  revalidateSettingsViews,
} from "./_shared";

const idSchema = z.string().trim().min(1).max(120);

const projectDetailsSchema = createProjectSchema.pick({ domain: true, name: true }).extend({
  projectId: idSchema,
});

const runProjectCheckSchema = z.object({ projectId: idSchema });
const projectTrackingScopeSchema = z.object({
  projectId: idSchema,
  trackingScope: trackingScopeSchema,
});

type ManualCheckKeyword = { publicId: string };
type ManualCheckResult = {
  failed: number;
  queued: number;
  reason?: "budget_exhausted";
  total: number;
};

const MANUAL_CHECK_CONCURRENCY = 4;

async function runManualChecks(
  keywords: ManualCheckKeyword[],
  runCheck: (input: { keywordId: string }) => Promise<unknown>,
): Promise<ManualCheckResult> {
  let nextIndex = 0;
  let budgetExhausted = false;
  let failed = 0;
  let queued = 0;
  const workerCount = Math.min(MANUAL_CHECK_CONCURRENCY, keywords.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!budgetExhausted && nextIndex < keywords.length) {
        const keyword = keywords[nextIndex];
        nextIndex += 1;
        if (!keyword) continue;
        try {
          const result = await runCheck({ keywordId: keyword.publicId });
          if (isBudgetExhaustedResult(result)) {
            budgetExhausted = true;
            continue;
          }
          queued += 1;
        } catch {
          failed += 1;
          // Keep the project-level manual run moving when one keyword fails.
        }
      }
    }),
  );
  if (budgetExhausted) {
    return {
      failed: keywords.length - queued,
      queued,
      reason: "budget_exhausted",
      total: keywords.length,
    };
  }
  return { failed, queued, total: keywords.length };
}

export async function updateProjectDetails(input: unknown) {
  const data = parseActionInput(projectDetailsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const before = await prisma.project.findUnique({
    select: { domain: true, name: true, publicId: true, trackingScope: true },
    where: { id: project.id },
  });
  if (!before) {
    throw new Error("Project not found.");
  }

  const updated = await prisma.project.update({
    data: { domain: data.domain, name: data.name },
    select: { domain: true, name: true, publicId: true, trackingScope: true },
    where: { id: project.id },
  });

  await writeAudit({
    action: "settings.project_details.update",
    actorId: actor.id,
    after: updated,
    before,
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateSettingsViews();

  return {
    domain: updated.domain,
    name: updated.name,
    projectId: updated.publicId,
    trackingScope: normalizeTrackingScope(updated.trackingScope),
  };
}

export async function updateProjectTrackingScope(input: unknown) {
  const data = parseActionInput(projectTrackingScopeSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, { type: "project" });
  const before = await prisma.project.findUnique({
    select: { publicId: true, trackingScope: true },
    where: { id: project.id },
  });
  if (!before) {
    throw new Error("Project not found.");
  }

  const updated = await prisma.project.update({
    data: { trackingScope: data.trackingScope },
    select: { publicId: true, trackingScope: true },
    where: { id: project.id },
  });

  await writeAudit({
    action: "settings.project_tracking_scope.update",
    actorId: actor.id,
    after: updated,
    before,
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateSettingsViews();

  return {
    projectId: updated.publicId,
    trackingScope: normalizeTrackingScope(updated.trackingScope),
  };
}

export async function updateDefaultRankCheckSettings(input: unknown) {
  const data = parseActionInput(projectDefaultsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const [beforeDefaults, keywords] = await Promise.all([
    prisma.projectDefaults.findUnique({ where: { projectId: project.id } }),
    prisma.keyword.findMany({
      select: keywordMarketSelect,
      where: { projectId: project.id },
    }),
  ]);
  const schedule = normalizeSchedule(data);
  const resolvedDefault = await resolveProjectDefaultMarket({ ...data, projectId: project.id });
  const { displayName, locationId, ...market } = resolvedDefault;
  const currentMarket = projectDefaultSerpMarket(beforeDefaults, keywords);
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
    action: "settings.defaults.update",
    actorId: actor.id,
    after: {
      market,
      movedKeywords: marketPlan.updateIds.length,
      schedule: projectDefaultsConfig(defaults),
      skippedConflicts: marketPlan.skipped,
    },
    before: {
      market: currentMarket,
      schedule: beforeDefaults ? projectDefaultsConfig(beforeDefaults) : null,
    },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project_defaults",
  });
  revalidateSettingsViews();

  return publicProjectDefaults(defaults, project.publicId);
}

export async function updateRankCheckFrequency(input: unknown) {
  const data = parseActionInput(projectDefaultsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const before = await prisma.projectDefaults.findUnique({ where: { projectId: project.id } });
  const schedule = normalizeSchedule(data);
  const defaults = await prisma.$transaction(async (tx) => {
    const stored = await tx.projectDefaults.upsert({
      create: { ...schedule, projectId: project.id },
      update: schedule,
      where: { projectId: project.id },
    });
    await refreshKeywordDispatchStates({ inheritedProjectId: project.id }, tx);
    return stored;
  });

  await writeAudit({
    action: "settings.rank_check_frequency.update",
    actorId: actor.id,
    after: projectDefaultsConfig(defaults),
    before: before ? projectDefaultsConfig(before) : null,
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project_defaults",
  });
  revalidateSettingsViews();

  return publicProjectDefaults(defaults, project.publicId);
}

export async function runManualProjectCheck(input: unknown) {
  const data = parseActionInput(runProjectCheckSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const keywords = await prisma.keyword.findMany({
    select: { publicId: true },
    where: { projectId: project.id },
  });

  // Defer the rank-check action so its server-only Temporal client stays out of
  // the module graph until a check is actually requested.
  const { runCheckNow } = await import("./rankCheck");
  const result = await runManualChecks(keywords, runCheckNow);

  await writeAudit({
    action: "settings.run_check_now",
    actorId: actor.id,
    after: result,
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateRankCheckViews();
  revalidateSettingsPage();

  return result;
}
