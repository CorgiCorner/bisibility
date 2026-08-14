"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { MAX_PROJECT_MARKETS, ProjectMarketLimitExceededError } from "@/lib/markets/limits";
import {
  type AddProjectMarketsResult,
  uniqueProjectMarketLocations,
} from "@/lib/markets/project-market-add-result";
import {
  ensureProjectMarketsWithinLimit,
  listProjectMarkets,
  pauseProjectMarket,
  reconcileProjectMarketsWithinLimit,
  removeProjectMarket,
} from "@/lib/markets/registry";
import { resolveKeywordLocation } from "@/lib/serp/location-service";
import { z } from "zod";

const idSchema = z.string().trim().min(1).max(120);
const marketChoiceSchema = z.object({
  canonicalKey: z.string().trim().min(2).max(180),
  countryCode: z.string().trim().length(2),
  kind: z.enum(["country", "region", "city"]),
  languageCode: z.string().trim().min(2).max(35),
});
const addMarketsSchema = z.object({
  choices: z.array(marketChoiceSchema).min(1).max(MAX_PROJECT_MARKETS),
  projectId: idSchema,
});
const marketActionSchema = z.object({ marketId: idSchema, projectId: idSchema });

export type ProjectMarketChoice = z.infer<typeof marketChoiceSchema>;
export type { AddProjectMarketsResult } from "@/lib/markets/project-market-add-result";

function isSerializableConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
}

async function resolveChoices(projectId: string, choices: readonly ProjectMarketChoice[]) {
  return Promise.all(
    choices.map(async (choice) => {
      const resolved = await resolveKeywordLocation(
        choice.kind === "country"
          ? {
              projectId,
              selection: {
                countryCode: choice.countryCode,
                kind: "country" as const,
                languageCode: choice.languageCode,
              },
            }
          : { projectId, selection: { canonicalKey: choice.canonicalKey, kind: "city" as const } },
      );
      return { locationId: resolved.location.id };
    }),
  );
}

export async function addProjectMarkets(input: unknown): Promise<AddProjectMarketsResult> {
  const data = parseActionInput(addMarketsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, {
    type: "project_market",
  });
  const resolvedMarkets = uniqueProjectMarketLocations(
    await resolveChoices(project.id, data.choices),
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        (tx) => ensureProjectMarketsWithinLimit(project.id, resolvedMarkets, tx),
        { isolationLevel: "Serializable" },
      );
      if (!result.ok) return result;
      await writeAudit({
        action: "settings.project_market.add",
        actorId: actor.id,
        after: { added: result.added, marketIds: result.marketIds },
        before: null,
        projectId: project.id,
        targetId: project.publicId,
        targetType: "project",
      });
      revalidateSettingsViews();
      return result;
    } catch (error) {
      if (attempt === 2 || !isSerializableConflict(error)) throw error;
    }
  }
  throw new Error("Project market transaction did not complete.");
}

export async function reconcileProjectMarkets(input: unknown) {
  const data = parseActionInput(addMarketsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, {
    type: "project_market",
  });
  const removalScope = await requireProjectScope(actor, "delete", data.projectId, {
    type: "project_market",
  });
  if (removalScope.id !== project.id) throw new Error("Project market scope changed.");
  const resolvedMarkets = uniqueProjectMarketLocations(
    await resolveChoices(project.id, data.choices),
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const before = await listProjectMarkets(project.id, tx);
          const selectedLocationIds = new Set(resolvedMarkets.map((market) => market.locationId));
          const omitted = before.filter((market) => !selectedLocationIds.has(market.locationId));
          if (omitted.length > 0) {
            await tx.projectMarket.updateMany({
              data: { status: ProjectMarketStatus.removed },
              where: {
                locationId: { in: omitted.map((market) => market.locationId) },
                projectId: project.id,
                status: {
                  in: [ProjectMarketStatus.active, ProjectMarketStatus.paused],
                },
              },
            });
          }
          const reconciled = await reconcileProjectMarketsWithinLimit(
            project.id,
            resolvedMarkets,
            tx,
          );
          if (!reconciled.ok) {
            throw new ProjectMarketLimitExceededError(reconciled.maxMarkets);
          }
          const removedMarketIds = omitted.map((market) => market.publicId);
          await writeAudit(
            {
              action: "onboarding.project_markets.reconcile",
              actorId: actor.id,
              after: {
                added: reconciled.added,
                marketIds: reconciled.marketIds,
                removedMarketIds,
              },
              before: { marketIds: before.map((market) => market.publicId) },
              projectId: project.id,
              targetId: project.publicId,
              targetType: "project",
            },
            tx,
          );
          return { marketIds: reconciled.marketIds, removedMarketIds };
        },
        { isolationLevel: "Serializable" },
      );
      revalidateSettingsViews();
      return result;
    } catch (error) {
      if (attempt === 2 || !isSerializableConflict(error)) throw error;
    }
  }
  throw new Error("Project market reconciliation did not complete.");
}

async function scopedMarket(projectId: string, marketId: string, action: "delete" | "update") {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, action, projectId, { type: "project_market" });
  const market = await prisma.projectMarket.findFirst({
    select: { locationId: true, publicId: true, status: true },
    where: { projectId: project.id, publicId: marketId },
  });
  if (!market) throw new Error("Project market not found.");
  return { actor, market, project };
}

export async function setProjectMarketEnabled(input: unknown) {
  const data = parseActionInput(marketActionSchema.extend({ enabled: z.boolean() }), input);
  const { actor, market, project } = await scopedMarket(data.projectId, data.marketId, "update");
  let resumed: Awaited<ReturnType<typeof ensureProjectMarketsWithinLimit>> | null = null;
  if (data.enabled) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        resumed = await prisma.$transaction(
          (tx) =>
            ensureProjectMarketsWithinLimit(project.id, [{ locationId: market.locationId }], tx),
          { isolationLevel: "Serializable" },
        );
        break;
      } catch (error) {
        if (!isSerializableConflict(error) || attempt === 2) throw error;
      }
    }
  }
  if (resumed && !resumed.ok) {
    throw new Error(`This project can track up to ${resumed.maxMarkets} markets.`);
  }
  const updated = data.enabled
    ? { status: "active" as const }
    : await pauseProjectMarket({ locationId: market.locationId, projectId: project.id });
  await writeAudit({
    action: data.enabled ? "settings.project_market.resume" : "settings.project_market.pause",
    actorId: actor.id,
    after: { status: updated.status },
    before: { status: market.status },
    projectId: project.id,
    targetId: market.publicId,
    targetType: "project_market",
  });
  revalidateSettingsViews();
}

export async function removeProjectMarketFromProject(input: unknown) {
  const data = parseActionInput(marketActionSchema, input);
  const { actor, market, project } = await scopedMarket(data.projectId, data.marketId, "delete");
  await removeProjectMarket({ locationId: market.locationId, projectId: project.id });
  await writeAudit({
    action: "settings.project_market.remove",
    actorId: actor.id,
    after: { status: "removed" },
    before: { status: market.status },
    projectId: project.id,
    targetId: market.publicId,
    targetType: "project_market",
  });
  revalidateSettingsViews();
}
