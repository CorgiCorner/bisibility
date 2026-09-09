"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { MAX_PROJECT_MARKETS, ProjectMarketLimitExceededError } from "@/lib/markets/limits";
import {
  projectMarketActionSchema,
  projectMarketEditSchema,
} from "@/lib/markets/project-market-edit";
import {
  listProjectMarkets,
  pauseProjectMarket,
  removeProjectMarket,
  restoreProjectMarket,
  resumeProjectMarket,
} from "@/lib/markets/registry";
import { z } from "zod";

class ProjectMarketLocationImmutableError extends Error {
  readonly code = "conflict";
  readonly status = 409;

  constructor() {
    super("A project market location cannot be changed in place.");
    this.name = "ProjectMarketLocationImmutableError";
  }
}

function assertProjectMarketLocationUnchanged(
  current: { locationId: string },
  next: { locationId?: string },
) {
  if (next.locationId !== undefined && next.locationId !== current.locationId) {
    throw new ProjectMarketLocationImmutableError();
  }
}

function revalidateMarketViews() {
  revalidateSettingsViews();
}

function isSerializableConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
}

async function scopedMarket(projectId: string, marketId: string, action: "delete" | "update") {
  if (parsePublicId(marketId)?.prefix !== "pmkt") throw new Error("Project market not found.");
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, action, projectId, { type: "project_market" });
  const market = await prisma.projectMarket.findFirst({
    select: {
      futureKeywordDevices: true,
      id: true,
      locationId: true,
      name: true,
      publicId: true,
      status: true,
    },
    where: { projectId: project.id, publicId: marketId },
  });
  if (!market) throw new Error("Project market not found.");
  return { actor, market, project };
}

export async function setProjectMarketEnabled(input: unknown) {
  const data = parseActionInput(
    projectMarketActionSchema.extend({ enabled: z.boolean(), locationId: z.string().optional() }),
    input,
  );
  const { actor, market, project } = await scopedMarket(data.projectId, data.marketId, "update");
  assertProjectMarketLocationUnchanged(market, data);
  const expectedStatus = data.enabled ? ProjectMarketStatus.paused : ProjectMarketStatus.active;
  if (market.status !== expectedStatus) throw new Error("Project market lifecycle changed.");
  const nextStatus = data.enabled ? ProjectMarketStatus.active : ProjectMarketStatus.paused;
  const result = await prisma.$transaction(async (tx) => {
    const changed = data.enabled
      ? await resumeProjectMarket({ locationId: market.locationId, projectId: project.id }, tx)
      : await pauseProjectMarket({ locationId: market.locationId, projectId: project.id }, tx);
    if (changed.count !== 1) throw new Error("Project market lifecycle changed.");
    await writeAudit(
      {
        action: data.enabled ? "settings.project_market.resume" : "settings.project_market.pause",
        actorId: actor.id,
        after: { status: nextStatus },
        before: { status: market.status },
        projectId: project.id,
        targetId: market.publicId,
        targetType: "project_market",
      },
      tx,
    );
    return { status: nextStatus };
  });
  revalidateMarketViews();
  return result;
}

export async function updateProjectMarket(input: unknown) {
  const data = parseActionInput(projectMarketEditSchema, input);
  const { actor, market, project } = await scopedMarket(data.projectId, data.marketId, "update");
  assertProjectMarketLocationUnchanged(market, data);
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.projectMarket.updateMany({
      data: { futureKeywordDevices: data.futureKeywordDevices, name: data.name },
      where: { id: market.id, projectId: project.id, status: market.status },
    });
    if (changed.count !== 1) throw new Error("Project market could not be updated.");
    await writeAudit(
      {
        action: "settings.project_market.update",
        actorId: actor.id,
        after: { futureKeywordDevices: data.futureKeywordDevices, name: data.name },
        before: { futureKeywordDevices: market.futureKeywordDevices, name: market.name },
        projectId: project.id,
        targetId: market.publicId,
        targetType: "project_market",
      },
      tx,
    );
    return { futureKeywordDevices: data.futureKeywordDevices, name: data.name };
  });
  revalidateMarketViews();
  return updated;
}

export async function restoreProjectMarketFromProject(input: unknown) {
  const data = parseActionInput(projectMarketActionSchema, input);
  const { actor, market, project } = await scopedMarket(data.projectId, data.marketId, "delete");
  if (market.status !== ProjectMarketStatus.removed) {
    throw new Error("Only an archived market can be restored.");
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const resumedKeywords = await prisma.$transaction(
        async (tx) => {
          const visible = await listProjectMarkets(project.id, tx);
          if (visible.length >= MAX_PROJECT_MARKETS) {
            throw new ProjectMarketLimitExceededError(MAX_PROJECT_MARKETS);
          }
          const resuming = await tx.keyword.count({
            where: { archivedAt: null, locationId: market.locationId, projectId: project.id },
          });
          const restored = await restoreProjectMarket(
            { locationId: market.locationId, projectId: project.id },
            tx,
          );
          if (restored.count === 0) throw new Error("Only an archived market can be restored.");
          await writeAudit(
            {
              action: "settings.project_market.restore",
              actorId: actor.id,
              after: { resumedKeywords: resuming, status: ProjectMarketStatus.active },
              before: { status: market.status },
              projectId: project.id,
              targetId: market.publicId,
              targetType: "project_market",
            },
            tx,
          );
          return resuming;
        },
        { isolationLevel: "Serializable" },
      );
      revalidateMarketViews();
      return { resumedKeywords };
    } catch (error) {
      if (attempt === 2 || !isSerializableConflict(error)) throw error;
    }
  }
  throw new Error("Project market restore did not complete.");
}

export async function removeProjectMarketFromProject(input: unknown) {
  const data = parseActionInput(projectMarketActionSchema, input);
  const { actor, market, project } = await scopedMarket(data.projectId, data.marketId, "update");
  const removed = await prisma.$transaction(async (tx) => {
    const changed = await removeProjectMarket(
      { locationId: market.locationId, projectId: project.id },
      tx,
    );
    if (changed.count !== 1) throw new Error("Only an active or paused market can be archived.");
    await writeAudit(
      {
        action: "settings.project_market.remove",
        actorId: actor.id,
        after: { status: ProjectMarketStatus.removed },
        before: { status: market.status },
        projectId: project.id,
        targetId: market.publicId,
        targetType: "project_market",
      },
      tx,
    );
    return { status: ProjectMarketStatus.removed };
  });
  revalidateMarketViews();
  return removed;
}
