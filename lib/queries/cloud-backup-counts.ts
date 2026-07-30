import "server-only";

import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import {
  CLOUD_BACKUP_COUNT_KEYS,
  type CloudBackupCountKey,
  type CloudBackupCounts,
} from "@/lib/migration/cloud-backup-sections";
import { requireReadableProject } from "./_auth";

export async function getCloudBackupCounts(projectId: string): Promise<CloudBackupCounts> {
  const { actor, project } = await requireReadableProject(projectId);
  const projectWhere = { where: { projectId: project.id } };
  const loaders = {
    alertRules: () => prisma.alertRule.count(projectWhere),
    competitors: () => prisma.competitor.count(projectWhere),
    keywords: () => prisma.keyword.count(projectWhere),
    notificationPreferences: () =>
      prisma.notificationPreference.count({
        where: { projectId: project.id, userId: actor.id },
      }),
    rankChecks: () =>
      prisma.rankCheck.count({
        where: { keyword: { projectId: project.id }, ...whereExecutedChecks() },
      }),
    savedViews: () => prisma.savedView.count(projectWhere),
  } satisfies Record<CloudBackupCountKey, () => Promise<number>>;
  const entries = await Promise.all(
    CLOUD_BACKUP_COUNT_KEYS.map(async (key) => [key, await loaders[key]()] as const),
  );
  return Object.fromEntries(entries) as CloudBackupCounts;
}
