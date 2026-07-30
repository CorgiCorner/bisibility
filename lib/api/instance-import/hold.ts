import "server-only";

import { PROJECT_WRITE_MODE_MIGRATION_HOLD } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { releaseMigrationHoldsForProjects } from "@/lib/migration/stale-holds";

type ImportProjectHold = {
  id: string;
  publicId: string;
  writeMode: string;
  writeModeChangedAt: Date | null;
};

export function releaseTerminalImportHold(
  project: ImportProjectHold,
  outcome: "done" | "failed",
  client: Prisma.TransactionClient,
) {
  if (project.writeMode !== PROJECT_WRITE_MODE_MIGRATION_HOLD) return Promise.resolve(0);
  return releaseMigrationHoldsForProjects(
    [project],
    new Date(),
    `project.migration_hold.import_${outcome}_release`,
    client,
  );
}
