"use server";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId, requirePublicId } from "@/lib/db/public-id";
import {
  PROJECT_WRITE_MODE_ACTIVE,
  PROJECT_WRITE_MODE_MIGRATED,
  PROJECT_WRITE_MODE_MIGRATION_HOLD,
  type ProjectWriteMode,
} from "@/lib/deployment/project-write-mode";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "./_shared";

const writeModeSchema = z.object({
  projectId: z.string().refine((value) => parsePublicId(value)?.prefix === "prj", {
    message: "Expected a strict prj_ v3 public ID.",
  }),
});
const MIGRATION_CANCELLED_ERROR = "Migration cancelled.";
const nonterminalImportStates = ["idle", "receiving", "importing"] as const;
const selectProjectWriteMode = {
  id: true,
  publicId: true,
  writeMode: true,
  writeModeChangedAt: true,
  writeModeChangedById: true,
} as const;

async function setProjectWriteMode(input: unknown, writeMode: ProjectWriteMode, action: string) {
  const data = parseActionInput(writeModeSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    "manage",
    data.projectId,
    { type: "project" },
    { allowReadOnly: true },
  );
  const before = project;
  const now = new Date();
  const updated = await prisma.project.update({
    data: {
      writeMode,
      writeModeChangedAt: now,
      writeModeChangedById: actor.id,
    },
    select: selectProjectWriteMode,
    where: { id: project.id },
  });
  const projectId = requirePublicId(updated.publicId, "prj");
  const beforeProjectId = requirePublicId(before.publicId, "prj");

  await writeAudit({
    action,
    actorId: actor.id,
    after: { id: projectId, writeMode: updated.writeMode },
    before: { id: beforeProjectId, writeMode: before.writeMode },
    projectId: project.id,
    targetId: projectId,
    targetType: "project",
  });
  revalidateSettingsViews();

  return {
    projectId,
    writeMode: updated.writeMode,
  };
}

export async function enableMigrationHold(input: unknown) {
  return setProjectWriteMode(
    input,
    PROJECT_WRITE_MODE_MIGRATION_HOLD,
    "project.migration_hold.enable",
  );
}

export async function releaseMigrationHold(input: unknown) {
  return setProjectWriteMode(input, PROJECT_WRITE_MODE_ACTIVE, "project.migration_hold.release");
}

export async function cancelMigration(input: unknown) {
  const data = parseActionInput(writeModeSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    "manage",
    data.projectId,
    { type: "project" },
    { allowReadOnly: true },
  );
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const heldProject = await tx.project.findFirst({
      select: selectProjectWriteMode,
      where: { id: project.id, writeMode: PROJECT_WRITE_MODE_MIGRATION_HOLD },
    });

    // Cancellation terminalizes even idle import jobs created by token minting, because
    // the recovery card exposes them as real cancellable state.
    const job = await tx.cloudImportJob.findFirst({
      orderBy: { createdAt: "desc" },
      where: { projectId: project.id, state: { in: [...nonterminalImportStates] } },
    });
    const [cancelledJob] = job
      ? await tx.cloudImportJob.updateManyAndReturn({
          data: { error: MIGRATION_CANCELLED_ERROR, finishedAt: now, state: "failed" },
          where: { id: job.id, state: { in: [...nonterminalImportStates] } },
        })
      : [];
    if (cancelledJob) {
      const jobId = requirePublicId(cancelledJob.publicId, "imp");
      await tx.migrationImportChunk.deleteMany({ where: { jobId: cancelledJob.id } });
      await writeAudit(
        {
          action: "cloud_import.cancel",
          actorId: actor.id,
          after: { error: cancelledJob.error, id: jobId, state: cancelledJob.state },
          before: { id: job ? requirePublicId(job.publicId, "imp") : null, state: job?.state },
          projectId: project.id,
          targetId: jobId,
          targetType: "cloud_import_job",
        },
        tx,
      );
    }

    // Release the read-only hold only when one is actually active.
    if (!heldProject) {
      return { job: cancelledJob ?? null, project };
    }

    const updated = await tx.project.update({
      data: {
        writeMode: PROJECT_WRITE_MODE_ACTIVE,
        writeModeChangedAt: now,
        writeModeChangedById: actor.id,
      },
      select: selectProjectWriteMode,
      where: { id: heldProject.id },
    });
    const projectId = requirePublicId(updated.publicId, "prj");
    await writeAudit(
      {
        action: "project.migration_hold.cancel",
        actorId: actor.id,
        after: { id: projectId, writeMode: updated.writeMode },
        before: {
          id: requirePublicId(heldProject.publicId, "prj"),
          writeMode: heldProject.writeMode,
        },
        projectId: heldProject.id,
        targetId: projectId,
        targetType: "project",
      },
      tx,
    );
    return { job: cancelledJob ?? null, project: updated };
  });
  revalidateSettingsViews();

  return {
    importJob: result.job
      ? {
          error: result.job.error,
          id: requirePublicId(result.job.publicId, "imp"),
          state: result.job.state,
        }
      : null,
    projectId: requirePublicId(result.project.publicId, "prj"),
    writeMode: result.project.writeMode,
  };
}

export async function markProjectMigrated(input: unknown) {
  return setProjectWriteMode(input, PROJECT_WRITE_MODE_MIGRATED, "project.migrated.mark");
}

export async function reactivateProject(input: unknown) {
  return setProjectWriteMode(input, PROJECT_WRITE_MODE_ACTIVE, "project.migrated.reactivate");
}
