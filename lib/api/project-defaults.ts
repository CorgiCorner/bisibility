import "server-only";

import { normalizeSchedule } from "@/lib/actions/_schedule";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { projectDefaultsPatchSchema } from "@/lib/schemas/project";
import {
  keywordMarketSelect,
  type ProjectDefaultMarket,
  projectDefaultSerpMarket,
  serpMarketUpdatePlan,
} from "@/lib/serp/default-market";
import { resolveProjectDefaultMarket } from "@/lib/serp/project-default-market";
import { projectDefaultsUpsertArgs } from "@/lib/settings/project-defaults-write";
import type { ApiContext } from "./context";
import { forbidden, projectMatches } from "./context";
import { resourceResponse } from "./responses";
import { objectBody, parseApiInput, readJsonBody } from "./surface";

type DefaultsResourceRow = {
  cronExpression: string | null;
  frequency: string;
  jitterMinutes: number;
  lastCheckedAt: Date | null;
  nextCheckAt: Date | null;
  serpDepth: number;
  serpStopOnMatch: boolean;
  timezone: string;
  updatedAt?: Date;
};

const unwrittenDefaults: DefaultsResourceRow = {
  // Keep these fallback values aligned with ProjectDefaults in prisma/schema.prisma.
  cronExpression: null,
  frequency: "daily",
  jitterMinutes: 60,
  lastCheckedAt: null,
  nextCheckAt: null,
  serpDepth: 100,
  serpStopOnMatch: true,
  timezone: "UTC",
};

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

function defaultsResource(
  defaults: DefaultsResourceRow,
  projectPublicId: string,
  market: Pick<ProjectDefaultMarket, "city" | "country" | "device" | "locationKey" | "source">,
) {
  return {
    city: market.city,
    country: market.country,
    cron_expression: defaults.cronExpression,
    device: market.device,
    frequency: defaults.frequency,
    jitter_minutes: defaults.jitterMinutes,
    last_checked_at: iso(defaults.lastCheckedAt),
    location_key: market.locationKey,
    next_check_at: iso(defaults.nextCheckAt),
    project_id: projectPublicId,
    serp_depth: defaults.serpDepth,
    serp_stop_on_match: defaults.serpStopOnMatch,
    source: market.source,
    timezone: defaults.timezone,
    updated_at: iso(defaults.updatedAt),
  };
}

export async function getProjectDefaults(ctx: ApiContext, projectId: string) {
  if (!projectMatches(ctx.auth, projectId))
    return forbidden(ctx, "API key is not scoped to this project.");

  const [defaults, keywords] = await Promise.all([
    prisma.projectDefaults.findUnique({
      where: { projectId: ctx.auth.project.id },
    }),
    prisma.keyword.findMany({
      select: keywordMarketSelect,
      where: { projectId: ctx.auth.project.id },
    }),
  ]);
  const market = projectDefaultSerpMarket(defaults, keywords);

  return resourceResponse(
    defaultsResource(defaults ?? unwrittenDefaults, ctx.auth.project.publicId, market),
    { headers: ctx.headers },
  );
}

export async function updateProjectDefaults(ctx: ApiContext, projectId: string) {
  if (!projectMatches(ctx.auth, projectId))
    return forbidden(ctx, "API key is not scoped to this project.");

  const body = await readJsonBody(ctx);
  const data = parseApiInput(projectDefaultsPatchSchema, {
    ...objectBody(body),
    project_id: projectId,
  });
  const [before, keywords] = await Promise.all([
    prisma.projectDefaults.findUnique({
      where: { projectId: ctx.auth.project.id },
    }),
    prisma.keyword.findMany({
      select: keywordMarketSelect,
      where: { projectId: ctx.auth.project.id },
    }),
  ]);
  const schedule = normalizeSchedule(data);
  const currentMarket = projectDefaultSerpMarket(before, keywords);
  const shouldResolveMarket =
    data.city !== undefined ||
    data.country !== undefined ||
    data.device !== undefined ||
    data.locationKey !== undefined;
  const resolvedDefault = shouldResolveMarket
    ? await resolveProjectDefaultMarket({
        city: data.city,
        country: data.country ?? currentMarket.country,
        device: data.device ?? currentMarket.device,
        locationKey: data.locationKey,
        projectId: ctx.auth.project.id,
      })
    : null;
  const persistedMarket = resolvedDefault
    ? {
        city: resolvedDefault.city,
        country: resolvedDefault.country,
        device: resolvedDefault.device,
        locationKey: resolvedDefault.locationKey,
      }
    : null;
  const responseMarket = persistedMarket
    ? { ...persistedMarket, source: "explicit" as const }
    : currentMarket;
  const marketPlan = resolvedDefault
    ? serpMarketUpdatePlan(keywords, resolvedDefault, currentMarket)
    : null;
  const defaults = await prisma.$transaction(async (tx) => {
    const stored = await tx.projectDefaults.upsert(
      projectDefaultsUpsertArgs({
        defaults: { ...schedule, ...persistedMarket },
        projectId: ctx.auth.project.id,
        serpStopOnMatch: data.serpStopOnMatch,
      }),
    );
    if (marketPlan && resolvedDefault && marketPlan.updateIds.length > 0) {
      await tx.keyword.updateMany({
        data: {
          device: persistedMarket?.device,
          location: resolvedDefault.displayName,
          locationId: resolvedDefault.locationId,
        },
        where: { id: { in: marketPlan.updateIds } },
      });
    }
    await refreshKeywordDispatchStates({ inheritedProjectId: ctx.auth.project.id }, tx);
    return stored;
  });
  await writeAudit({
    action: "project_defaults.update",
    actorId: ctx.actorId ?? null,
    after: {
      market: responseMarket,
      movedKeywords: marketPlan?.updateIds.length ?? 0,
      schedule: defaults,
      skippedConflicts: marketPlan?.skipped ?? 0,
    },
    before: {
      market: currentMarket,
      schedule: before,
    },
    projectId: ctx.auth.project.id,
    targetId: ctx.auth.project.publicId,
    targetType: "project",
  });

  return resourceResponse(defaultsResource(defaults, ctx.auth.project.publicId, responseMarket), {
    headers: ctx.headers,
  });
}
