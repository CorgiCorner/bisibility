import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { requirePublicId } from "@/lib/db/public-id";
import {
  PROJECT_WRITE_MODE_ACTIVE,
  PROJECT_WRITE_MODE_MIGRATION_HOLD,
} from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";

const DEFAULT_HOLD_TTL_HOURS = 24;

export type ReleaseExpiredMigrationHoldsOptions = {
  ttlHours?: number;
};

function configuredTtlHours() {
  const parsed = Number.parseInt(process.env.BISIBILITY_MIGRATION_HOLD_TTL_HOURS ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_HOLD_TTL_HOURS;
}

function holdTtlHours(input?: number) {
  const ttlHours = input ?? configuredTtlHours();
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new Error("ttlHours must be a positive finite number.");
  }
  return ttlHours;
}

type HeldProject = {
  id: string;
  publicId: string;
  writeMode: string;
  writeModeChangedAt: Date | null;
};

export async function releaseMigrationHoldsForProjects(
  projects: HeldProject[],
  now: Date,
  action: string,
  client: Prisma.TransactionClient,
) {
  if (projects.length === 0) return 0;
  const result = await client.project.updateMany({
    data: {
      writeMode: PROJECT_WRITE_MODE_ACTIVE,
      writeModeChangedAt: now,
      writeModeChangedById: null,
    },
    where: {
      id: { in: projects.map((project) => project.id) },
      writeMode: PROJECT_WRITE_MODE_MIGRATION_HOLD,
    },
  });
  await Promise.all(
    projects.map((project) => {
      const projectId = requirePublicId(project.publicId, "prj");
      return writeAudit(
        {
          action,
          actorId: null,
          after: { id: projectId, writeMode: PROJECT_WRITE_MODE_ACTIVE },
          before: {
            id: projectId,
            writeMode: project.writeMode,
            writeModeChangedAt: project.writeModeChangedAt,
          },
          projectId: project.id,
          targetId: projectId,
          targetType: "project",
        },
        client,
      );
    }),
  );
  return result.count;
}

export async function releaseExpiredMigrationHolds(
  options: ReleaseExpiredMigrationHoldsOptions = {},
): Promise<number> {
  const ttlHours = holdTtlHours(options.ttlHours);
  const now = new Date();
  const cutoff = new Date(now.getTime() - ttlHours * 60 * 60_000);

  return prisma.$transaction(async (tx) => {
    const projects = await tx.project.findMany({
      select: { id: true, publicId: true, writeMode: true, writeModeChangedAt: true },
      where: {
        writeMode: PROJECT_WRITE_MODE_MIGRATION_HOLD,
        writeModeChangedAt: { lt: cutoff },
      },
    });
    return releaseMigrationHoldsForProjects(
      projects,
      now,
      "project.migration_hold.auto_release",
      tx,
    );
  });
}
