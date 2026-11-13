"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { buildEnginesPageModel, type EnginesPageModel } from "@/lib/ai-tracking/engines-model";
import {
  projectEngineSelection,
  toggleableProjectEngines,
} from "@/lib/ai-tracking/project-engine-set";
import { canWriteAiTracking } from "@/lib/ai-tracking/projections/schedule-list";
import { loadProjectEngineChoice } from "@/lib/ai-tracking/queries/project-engines";
import { trackingEnginePriceCard } from "@/lib/ai-tracking/tracking-engine-prices";
import { auditTrackingEngine } from "@/lib/api/ai-tracking-audit";
import { trackingScope } from "@/lib/api/ai-tracking-service";
import { getProjectRole } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { getActionActor, parseActionInput } from "./_shared";
import {
  type AiProjectEngineActionResult,
  setAiProjectEngineSchema,
} from "./ai-project-engines-input";

const ANSWER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const engineSelect = { enabled: true, engine: true, source: true } as const;

function revalidateEngines() {
  revalidatePath(appPath(asProjectRef("[project]"), "ai-visibility"), "page");
  revalidatePath(appPath(asProjectRef("[project]"), "schedules"), "page");
}

export async function getAiVisibilityEnabledEngines(projectId: string): Promise<string[]> {
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectId);
  const choice = await loadProjectEngineChoice(project.id);
  return [...new Set(choice.enabledEngines.map((pair) => pair.engine))];
}

export async function getAiVisibilityEngines(projectId: string): Promise<EnginesPageModel> {
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectId);
  const since = new Date(Date.now() - ANSWER_WINDOW_MS);
  const [rows, connection, rankCheck, recent] = await Promise.all([
    prisma.aiProjectEngine.findMany({
      select: engineSelect,
      where: { projectId: project.id },
    }),
    prisma.providerConnection.findFirst({
      select: { id: true },
      where: {
        enabled: true,
        projectId: project.id,
        provider: "dataforseo",
        status: "connected",
      },
    }),
    prisma.rankCheck.findFirst({
      select: { id: true },
      where: { keyword: { projectId: project.id } },
    }),
    prisma.aiTrackingSample.groupBy({
      _count: { _all: true },
      by: ["engine", "source"],
      where: {
        finishedAt: { gte: since },
        measurement: "answer_present",
        projectId: project.id,
      },
    }),
  ]);
  const selection = projectEngineSelection(rows);
  const recentByEngine: Record<string, number> = {};
  for (const row of recent) recentByEngine[`${row.source}:${row.engine}`] = row._count._all;
  return buildEnginesPageModel({
    canWrite: canWriteAiTracking(getProjectRole(actor, project.id), project.writeMode),
    connected: Boolean(connection),
    enabled: selection.enabled,
    hasRankChecks: Boolean(rankCheck),
    prices: trackingEnginePriceCard(),
    recentByEngine,
    toggleable: toggleableProjectEngines(),
  });
}

export async function setAiProjectEngine(input: unknown): Promise<AiProjectEngineActionResult> {
  const data = parseActionInput(setAiProjectEngineSchema, input);
  const toggleable = toggleableProjectEngines().some(
    (pair) => pair.engine === data.engine && pair.source === data.source,
  );
  if (!toggleable) return { error: "unavailable", ok: false };
  const actor = await getActionActor();
  const project = await trackingScope(actor, data.projectId, true);
  const changed = await prisma.$transaction(async (tx) => {
    const where = {
      projectId_engine_source: {
        engine: data.engine,
        projectId: project.id,
        source: data.source,
      },
    };
    const before = await tx.aiProjectEngine.findUnique({ select: engineSelect, where });
    if (before?.enabled === data.enabled) return false;
    const after = await tx.aiProjectEngine.upsert({
      create: {
        enabled: data.enabled,
        engine: data.engine,
        projectId: project.id,
        source: data.source,
        updatedById: actor.id,
      },
      select: engineSelect,
      update: { enabled: data.enabled, updatedById: actor.id },
      where,
    });
    await auditTrackingEngine(actor, project, after, before, tx);
    return true;
  });
  if (!changed) return { ok: true };
  recordAppAction(actor);
  revalidateEngines();
  return { ok: true };
}
