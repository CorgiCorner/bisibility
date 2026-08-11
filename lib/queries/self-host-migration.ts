import "server-only";

import { prisma } from "@/lib/db/prisma";
import { deploymentMode } from "@/lib/deployment/deployment";
import { migrationHoldTtlHours, selfHostMigrationState } from "@/lib/deployment/project-write-mode";
import { requireReadableProject } from "@/lib/queries/_auth";

export async function getSelfHostMigrationState(projectId: string) {
  const { project } = await requireReadableProject(projectId);
  if (deploymentMode() !== "cloud") {
    throw new Error("Move to self-host is available only on hosted deployments.");
  }
  const state = await prisma.project.findUniqueOrThrow({
    select: { writeMode: true, writeModeChangedAt: true },
    where: { id: project.id },
  });
  return selfHostMigrationState(
    state,
    migrationHoldTtlHours(undefined, process.env.BISIBILITY_MIGRATION_HOLD_TTL_HOURS),
  );
}
