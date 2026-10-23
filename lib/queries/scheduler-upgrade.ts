import "server-only";

import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import { readSchedulerUpgradeConflicts } from "@/lib/rank-check/scheduler-upgrade-conflicts";
import { requireReadableProject } from "./_auth";

export async function listSchedulerUpgradeIssues(projectPublicId: string) {
  const { actor, project } = await requireReadableProject(projectPublicId);
  if (!canProjectAction(getProjectRole(actor, project.id), "manage", "check_schedule")) return [];
  const conflicts = await readSchedulerUpgradeConflicts(prisma, project.id);
  return conflicts
    .filter((row) => row.reason !== "legacy_override_mismatch")
    .map((row) => ({ keywordId: row.keywordId, keywordText: row.keywordText }));
}
