"use server";

import {
  getActionActor,
  type ProjectScope,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { exportCloudImportPackage } from "@/lib/actions/keyword-import-export";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId, requirePublicId } from "@/lib/db/public-id";
import { deploymentMode } from "@/lib/deployment/deployment";
import {
  migrationHoldTtlHours,
  PROJECT_WRITE_MODE_ACTIVE,
  PROJECT_WRITE_MODE_MIGRATED,
  PROJECT_WRITE_MODE_MIGRATION_HOLD,
  type ProjectWriteMode,
  type SelfHostMigrationState,
  selfHostMigrationState,
} from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";

const inputSchema = z.object({
  projectId: z.string().refine((value) => parsePublicId(value)?.prefix === "prj", {
    message: "Expected a strict prj_ v3 public ID.",
  }),
});
const projectStateSelect = {
  id: true,
  publicId: true,
  writeMode: true,
  writeModeChangedAt: true,
  writeModeChangedById: true,
} as const;
type ProjectState = {
  id: string;
  publicId: string;
  writeMode: ProjectWriteMode;
  writeModeChangedAt: Date | null;
  writeModeChangedById: string | null;
};
export type StartSelfHostMigrationResult = {
  migration: SelfHostMigrationState;
  packageFile: Awaited<ReturnType<typeof exportCloudImportPackage>>;
};

function requireHostedDeployment() {
  if (deploymentMode() !== "cloud") {
    throw new Error("Move to self-host is available only on hosted deployments.");
  }
}

function requireMigratableProject(project: ProjectState) {
  if (project.writeMode === PROJECT_WRITE_MODE_MIGRATED) {
    throw new Error("Reactivate the project before starting a new migration.");
  }
  return project;
}

async function auditHoldEnabled(
  before: ProjectState,
  after: ProjectState,
  actorId: string,
  tx: Prisma.TransactionClient,
) {
  const projectId = requirePublicId(after.publicId, "prj");
  await writeAudit(
    {
      action: "project.migration_hold.enable",
      actorId,
      after: { id: projectId, writeMode: after.writeMode },
      before: {
        id: requirePublicId(before.publicId, "prj"),
        writeMode: before.writeMode,
        writeModeChangedAt: before.writeModeChangedAt,
      },
      projectId: after.id,
      targetId: projectId,
      targetType: "project",
    },
    tx,
  );
}

async function updateToHold(
  project: ProjectState,
  actorId: string,
  now: Date,
  tx: Prisma.TransactionClient,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = requireMigratableProject(
      await tx.project.findUniqueOrThrow({ select: projectStateSelect, where: { id: project.id } }),
    );
    if (current.writeMode === PROJECT_WRITE_MODE_MIGRATION_HOLD && current.writeModeChangedAt) {
      return current;
    }
    const active = current.writeMode === PROJECT_WRITE_MODE_ACTIVE;
    const [updated] = await tx.project.updateManyAndReturn({
      data: active
        ? {
            writeMode: PROJECT_WRITE_MODE_MIGRATION_HOLD,
            writeModeChangedAt: now,
            writeModeChangedById: actorId,
          }
        : { writeModeChangedAt: now, writeModeChangedById: actorId },
      select: projectStateSelect,
      where: active
        ? { id: current.id, writeMode: PROJECT_WRITE_MODE_ACTIVE }
        : {
            id: current.id,
            writeMode: PROJECT_WRITE_MODE_MIGRATION_HOLD,
            writeModeChangedAt: null,
          },
    });
    if (updated) {
      await auditHoldEnabled(current, updated, actorId, tx);
      return updated;
    }
  }
  throw new Error("Migration hold changed concurrently. Try again.");
}

async function acquireMigrationHold(project: ProjectState, actorId: string) {
  return prisma.$transaction((tx) => updateToHold(project, actorId, new Date(), tx));
}

async function authorizedProject(input: unknown) {
  const data = parseActionInput(inputSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    "manage",
    data.projectId,
    { type: "project" },
    { allowReadOnly: true },
  );
  requireHostedDeployment();
  return { actor, data, project: project as ProjectScope & ProjectState };
}

export async function startSelfHostMigration(
  input: unknown,
): Promise<StartSelfHostMigrationResult> {
  const { actor, data, project } = await authorizedProject(input);
  const held = await acquireMigrationHold(project, actor.id);
  revalidateSettingsViews();
  const packageFile = await exportCloudImportPackage({ projectId: data.projectId });
  const migration = selfHostMigrationState(
    held,
    migrationHoldTtlHours(undefined, process.env.BISIBILITY_MIGRATION_HOLD_TTL_HOURS),
  );
  await writeAudit({
    action: "project.self_host_migration.start",
    actorId: actor.id,
    after: { ...migration, id: data.projectId },
    before: {
      id: data.projectId,
      writeMode: project.writeMode,
      writeModeChangedAt: project.writeModeChangedAt,
    },
    projectId: project.id,
    targetId: data.projectId,
    targetType: "project",
  });
  return { migration, packageFile };
}

async function rollbackHeldProject(project: ProjectState, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const current = requireMigratableProject(
      await tx.project.findUniqueOrThrow({ select: projectStateSelect, where: { id: project.id } }),
    );
    if (current.writeMode === PROJECT_WRITE_MODE_ACTIVE) return current;
    const [updated] = await tx.project.updateManyAndReturn({
      data: {
        writeMode: PROJECT_WRITE_MODE_ACTIVE,
        writeModeChangedAt: now,
        writeModeChangedById: actorId,
      },
      select: projectStateSelect,
      where: { id: project.id, writeMode: PROJECT_WRITE_MODE_MIGRATION_HOLD },
    });
    if (!updated) {
      return requireMigratableProject(
        await tx.project.findUniqueOrThrow({
          select: projectStateSelect,
          where: { id: project.id },
        }),
      );
    }
    const projectId = requirePublicId(updated.publicId, "prj");
    await writeAudit(
      {
        action: "project.self_host_migration.rollback",
        actorId,
        after: { id: projectId, writeMode: updated.writeMode },
        before: {
          id: requirePublicId(current.publicId, "prj"),
          writeMode: current.writeMode,
          writeModeChangedAt: current.writeModeChangedAt,
        },
        projectId: project.id,
        targetId: projectId,
        targetType: "project",
      },
      tx,
    );
    return updated;
  });
}

export async function rollbackSelfHostMigration(input: unknown): Promise<SelfHostMigrationState> {
  const { actor, project } = await authorizedProject(input);
  const updated = await rollbackHeldProject(project, actor.id);
  revalidateSettingsViews();
  return selfHostMigrationState(
    updated,
    migrationHoldTtlHours(undefined, process.env.BISIBILITY_MIGRATION_HOLD_TTL_HOURS),
  );
}
