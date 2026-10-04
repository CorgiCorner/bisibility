"use server";

import { analyzeBacklinks, loadMoreBacklinkRows } from "@/lib/backlinks/service";
import { UnsupportedBacklinksTargetError } from "@/lib/backlinks/target";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const analyzeBacklinksActionSchema = z.object({
  estimateOnly: z.boolean().default(false),
  fresh: z.boolean().default(false),
  includeSubdomains: z.boolean().default(true),
  maxCostCents: z.number().int().nonnegative().optional(),
  mode: z.enum(["as_is", "one_per_domain"]).default("as_is"),
  projectId: z.string().trim().min(1).max(120),
  resultLimit: z
    .union([z.literal(100), z.literal(300), z.literal(500), z.literal(1000)])
    .default(100),
  target: z.string().trim().min(1),
  targetScope: z.enum(["site", "page"]).default("site"),
});

const loadMoreBacklinkRowsActionSchema = z.object({
  includeSubdomains: z.boolean(),
  limit: z.number().int().min(100).max(1000).multipleOf(100),
  projectId: z.string().trim().min(1).max(120),
  target: z.string().trim().min(1),
  targetScope: z.enum(["site", "page"]),
});

export type AnalyzeBacklinksActionInput = z.input<typeof analyzeBacklinksActionSchema>;
export type AnalyzeBacklinksAction = typeof analyzeBacklinksAction;
export type LoadMoreBacklinkRowsAction = typeof loadMoreBacklinkRowsAction;

async function withTargetValidation<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof UnsupportedBacklinksTargetError)) throw error;
    return { ok: false as const, reason: "unsupported_target" as const, message: error.message };
  }
}

export async function analyzeBacklinksAction(input: unknown) {
  const data = parseActionInput(analyzeBacklinksActionSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, {
    type: "project",
  });

  return withTargetValidation(() =>
    analyzeBacklinks(
      { actorId: actor.id, origin: APP_REQUEST_ORIGIN, projectId: project.id },
      {
        estimateOnly: data.estimateOnly,
        fresh: data.fresh,
        includeSubdomains: data.includeSubdomains,
        maxCostCents: data.maxCostCents,
        mode: data.mode,
        resultLimit: data.resultLimit,
        target: data.target,
        targetScope: data.targetScope,
      },
    ),
  );
}

export async function loadMoreBacklinkRowsAction(input: unknown) {
  const data = parseActionInput(loadMoreBacklinkRowsActionSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, {
    type: "project",
  });

  return withTargetValidation(() =>
    loadMoreBacklinkRows(
      { actorId: actor.id, origin: APP_REQUEST_ORIGIN, projectId: project.id },
      {
        includeSubdomains: data.includeSubdomains,
        limit: data.limit,
        target: data.target,
        targetScope: data.targetScope,
      },
    ),
  );
}
