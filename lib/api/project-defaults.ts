import "server-only";

import { prisma } from "@/lib/db/prisma";
import { previewDefaultsHost, saveDefaultsHost } from "@/lib/measurement-settings/host/defaults";
import { SettingsHostError } from "@/lib/measurement-settings/host/errors";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { projectDefaultsPatchSchema } from "@/lib/schemas/project";
import { resolveEffectiveSerpStopOnMatch } from "@/lib/serp/constants";
import {
  keywordMarketSelect,
  type ProjectDefaultMarket,
  projectDefaultSerpMarket,
} from "@/lib/serp/default-market";
import { DefaultsReviewRequiredError } from "@/lib/settings/reviewed-defaults-contract";
import type { ApiContext } from "./context";
import { forbidden, projectMatches } from "./context";
import { defaultsApiContext } from "./project-defaults-authority";
import { errorResponse, resourceResponse } from "./responses";
import { camelizeKeys, objectBody, parseApiInput, readJsonBody, snakeizeKeys } from "./surface";

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
  // Defaults never authorize recurrence; named schedule memberships own it.
  cronExpression: null,
  frequency: "manual",
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
    cron_expression: null,
    device: market.device,
    frequency: "manual",
    jitter_minutes: 0,
    last_checked_at: iso(defaults.lastCheckedAt),
    location_key: market.locationKey,
    next_check_at: null,
    project_id: projectPublicId,
    serp_depth: defaults.serpDepth,
    serp_stop_on_match: resolveEffectiveSerpStopOnMatch(
      defaults.serpStopOnMatch,
      defaults.serpDepth,
    ),
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
  const body = objectBody(camelizeKeys(await readJsonBody(ctx)));
  const data = parseApiInput(projectDefaultsPatchSchema, {
    ...body,
    frequency: "manual",
    cronExpression: null,
    jitterMinutes: 0,
    timezone: "UTC",
    project_id: projectId,
  });
  const context = defaultsApiContext(ctx);
  const request = { kind: "patch" as const, values: data };
  try {
    if (ctx.url.searchParams.get("preview_only") === "true")
      return resourceResponse(snakeizeKeys(await previewDefaultsHost(context, request)), {
        headers: ctx.headers,
      });
    const result = await saveDefaultsHost(context, request, body.review);
    const v = result.value;
    return resourceResponse(
      defaultsResource(
        {
          ...v,
          lastCheckedAt: result.timestamps.lastCheckedAt
            ? new Date(result.timestamps.lastCheckedAt)
            : null,
          nextCheckAt: result.timestamps.nextCheckAt
            ? new Date(result.timestamps.nextCheckAt)
            : null,
          updatedAt: new Date(result.timestamps.updatedAt),
        },
        ctx.auth.project.publicId,
        result.market,
      ),
      { headers: ctx.headers },
    );
  } catch (error) {
    if (error instanceof DefaultsReviewRequiredError)
      return errorResponse("conflict", error.message, 428, {
        headers: ctx.headers,
        instance: ctx.instance,
        problemDetails: { reason: "preview_required" },
      });
    if (error instanceof SettingsHostError || error instanceof PreviewTokenError)
      return errorResponse("conflict", "Settings or quote changed. Preview again.", 409, {
        headers: ctx.headers,
        instance: ctx.instance,
        problemDetails: {
          reason:
            error instanceof SettingsHostError
              ? error.code
              : error.code === "expired"
                ? "preview_expired"
                : "preview_mismatch",
        },
      });
    throw error;
  }
}
