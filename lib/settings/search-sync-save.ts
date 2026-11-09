import "server-only";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { projectSearchSyncSchema } from "@/lib/schemas/project";
import { replanActiveGscBackfill } from "@/lib/search-insights/sync/backfill-plan";
import { projectDefaultsConfig, publicProjectDefaults } from "./project-defaults-config";

export async function saveSearchSyncSettings(
  input: unknown,
  onCommitted?: (actor: Awaited<ReturnType<typeof getActionActor>>) => void,
) {
  const data = parseActionInput(projectSearchSyncSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const before = await prisma.projectDefaults.findUnique({ where: { projectId: project.id } });
  const defaults = await prisma.$transaction(async (tx) => {
    // Lock and re-plan the import before touching project defaults. Initial planning uses the
    // same import-to-defaults order, so concurrent saves cannot form a database lock cycle.
    await replanActiveGscBackfill(
      { projectId: project.id, retentionMonths: data.retentionMonths },
      tx,
    );
    return tx.projectDefaults.upsert({
      create: {
        projectId: project.id,
        searchSyncImportMonths: data.retentionMonths,
        searchSyncPace: data.pace,
      },
      update: { searchSyncImportMonths: data.retentionMonths, searchSyncPace: data.pace },
      where: { projectId: project.id },
    });
  });
  onCommitted?.(actor);
  await writeAudit({
    action: "settings.search_data_sync.update",
    actorId: actor.id,
    after: projectDefaultsConfig(defaults),
    before: before ? projectDefaultsConfig(before) : null,
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project_defaults",
  });
  revalidateSettingsViews();
  const actionResult = await publicProjectDefaults(defaults, project.publicId);
  return { actor, value: actionResult };
}
