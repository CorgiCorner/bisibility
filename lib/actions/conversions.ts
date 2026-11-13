"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
  revalidateTimelineViews,
} from "@/lib/actions/_shared";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { writeAudit } from "@/lib/auth/audit";
import { projectGa4KeyEvents } from "@/lib/conversions/ga4";
import {
  setPrimaryConversionSourceSchema,
  syncConversionSourceSchema,
  updateConversionGoalSchema,
} from "@/lib/conversions/input";
import { syncPlausibleConversions } from "@/lib/conversions/plausible-sync";
import {
  type ConversionActionResult,
  conversionSourceReportsRevenue,
  isConversionSource,
  primaryConversionSignalPayload,
} from "@/lib/conversions/types";
import { prisma } from "@/lib/db/prisma";
import { emitSignal } from "@/lib/signals/emit";
import { SIGNAL_TYPES } from "@/lib/signals/types";

export async function setPrimaryConversionSource(input: unknown): Promise<ConversionActionResult> {
  const data = parseActionInput(setPrimaryConversionSourceSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const connection = await prisma.providerConnection.findUnique({
    select: { enabled: true, kind: true, status: true },
    where: { projectId_provider: { projectId: project.id, provider: data.source } },
  });
  const connected =
    connection?.kind === "analytics" && connection.status === "connected" && connection.enabled;
  if (!connected) return { error: "not_connected", ok: false };
  const changed = await prisma.$transaction(async (tx) => {
    const before = await tx.projectDefaults.findUnique({
      select: { primaryConversionSource: true },
      where: { projectId: project.id },
    });
    if (before?.primaryConversionSource === data.source) return false;
    await tx.projectDefaults.upsert({
      create: { primaryConversionSource: data.source, projectId: project.id },
      update: { primaryConversionSource: data.source },
      where: { projectId: project.id },
    });
    await emitSignal(
      {
        createdById: actor.id,
        payload: primaryConversionSignalPayload(
          isConversionSource(before?.primaryConversionSource)
            ? before.primaryConversionSource
            : null,
          data.source,
        ),
        projectId: project.id,
        severity: "info",
        source: "manual",
        type: SIGNAL_TYPES.note,
      },
      tx,
    );
    await writeAudit(
      {
        action: "conversion.primary.update",
        actorId: actor.id,
        after: { primaryConversionSource: data.source },
        before: { primaryConversionSource: before?.primaryConversionSource ?? null },
        projectId: project.id,
        targetId: project.publicId,
        targetType: "project_defaults",
      },
      tx,
    );
    return true;
  });
  if (!changed) return { ok: true, unchanged: true };
  recordAppAction(actor);
  revalidateSettingsViews();
  revalidateTimelineViews();
  return { ok: true };
}

export async function updateConversionGoal(input: unknown): Promise<ConversionActionResult> {
  const data = parseActionInput(updateConversionGoalSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const goal = await prisma.conversionGoal.findFirst({
    where: { id: data.goalId, projectId: project.id },
  });
  if (!goal || !isConversionSource(goal.source)) return { error: "missing", ok: false };
  if (data.countsRevenue === true) {
    if (!conversionSourceReportsRevenue(goal.source)) return { error: "revenue", ok: false };
    const reported = await prisma.conversionDaily.findFirst({
      select: { id: true },
      where: {
        name: goal.sourceName,
        projectId: project.id,
        revenueMinor: { not: null },
        source: goal.source,
      },
    });
    if (!reported) return { error: "revenue", ok: false };
  }
  const next = {
    countsRevenue: data.countsRevenue ?? goal.countsRevenue,
    displayName: data.displayName ?? goal.displayName,
    enabled: data.enabled ?? goal.enabled,
  };
  if (
    next.countsRevenue === goal.countsRevenue &&
    next.displayName === goal.displayName &&
    next.enabled === goal.enabled
  ) {
    return { ok: true, unchanged: true };
  }
  await prisma.conversionGoal.update({ data: next, where: { id: goal.id } });
  recordAppAction(actor);
  await writeAudit({
    action: "conversion.goal.update",
    actorId: actor.id,
    after: { ...next, source: goal.source, sourceName: goal.sourceName },
    before: {
      countsRevenue: goal.countsRevenue,
      displayName: goal.displayName,
      enabled: goal.enabled,
      source: goal.source,
      sourceName: goal.sourceName,
    },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project_defaults",
  });
  revalidateSettingsViews();
  return { ok: true };
}

export async function syncConversionSource(input: unknown): Promise<ConversionActionResult> {
  const data = parseActionInput(syncConversionSourceSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const connection = await prisma.providerConnection.findUnique({
    select: { enabled: true, kind: true, status: true },
    where: { projectId_provider: { projectId: project.id, provider: data.source } },
  });
  const connected =
    connection?.kind === "analytics" && connection.status === "connected" && connection.enabled;
  if (!connected) return { error: "not_connected", ok: false };
  if (data.source === "plausible") {
    const result = await syncPlausibleConversions(project.id);
    if (!result.ok) return { error: "failed", ok: false };
  } else {
    try {
      await projectGa4KeyEvents(project.id);
    } catch {
      return { error: "failed", ok: false };
    }
  }
  recordAppAction(actor);
  await writeAudit({
    action: "conversion.sync_now",
    actorId: actor.id,
    after: { source: data.source },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateSettingsViews();
  return { ok: true };
}
