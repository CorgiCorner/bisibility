"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { CONVERSION_SOURCES } from "@/lib/conversions/types";
import { takePageSnapshot } from "@/lib/pages/snapshot";
import { PageSnapshotConflictError } from "@/lib/pages/snapshot-errors";
import { loadExistingVsNew } from "@/lib/pages/snapshot-read";
import { snapshotMetrics, snapshotSpans } from "@/lib/pages/snapshot-view";
import { appPath } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const takeSchema = z.object({
  confirm: z.boolean().optional(),
  projectId: z.string().trim().min(1).max(120),
});

const comparisonSchema = z.object({
  conversionSource: z.enum(CONVERSION_SOURCES).optional(),
  metric: z.enum(snapshotMetrics).optional(),
  span: z.enum(snapshotSpans),
  tag: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/u)
    .max(80)
    .optional(),
});

function revalidateProject(publicId: string) {
  revalidatePath(appPath(publicId, "pages"));
  revalidatePath(appPath(publicId, "annotations"));
}

/** Saves the Day 1 page list. A second save archives the previous list after confirmation. */
export async function takePageSnapshotAction(input: unknown) {
  const data = parseActionInput(takeSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type: "keyword" });
  try {
    const result = await takePageSnapshot({
      actorId: actor.id,
      confirm: data.confirm,
      projectId: project.id,
    });
    if (result.status !== "taken") return result;
    recordAppAction(actor);
    await writeAudit({
      action: "page_snapshot.take",
      actorId: actor.id,
      after: {
        pageCount: result.snapshot.pageCount,
        replaced: result.replaced,
        source: result.snapshot.source,
        takenOn: result.snapshot.takenOn,
      },
      projectId: project.id,
      targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
      targetType: "project",
    });
    revalidateProject(project.publicId);
    return result;
  } catch (error) {
    if (error instanceof PageSnapshotConflictError) return { status: "conflict" as const };
    throw error;
  }
}

/** Cumulative existing and new pages for the active snapshot. */
export async function loadExistingVsNewAction(projectId: string, input: unknown) {
  const data = parseActionInput(comparisonSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    "read",
    projectId,
    { type: "keyword" },
    { allowReadOnly: true },
  );
  return loadExistingVsNew(project.id, {
    conversionSource: data.conversionSource,
    metric: data.metric,
    span: data.span,
    tagId: data.tag,
  });
}
