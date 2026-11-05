import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Retirement is silent: no notification event, transition or digest watermark. */
export async function closeProjectIncidentsSilently(
  tx: Prisma.TransactionClient,
  projectId: string,
  now?: Date,
  options: { retainNotifications?: boolean } = {},
) {
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId} FOR UPDATE`;
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { providerIncidentsRetiredThrough: true },
  });
  if (!project) return;
  const retiredThrough =
    now ?? (await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`)[0].now;
  const cutoff =
    project.providerIncidentsRetiredThrough &&
    project.providerIncidentsRetiredThrough > retiredThrough
      ? project.providerIncidentsRetiredThrough
      : retiredThrough;
  await tx.project.update({
    where: { id: projectId },
    data: { providerIncidentsRetiredThrough: cutoff },
  });
  await tx.providerIncident.updateMany({
    where: { projectId, retiredAt: null },
    data: { retiredAt: cutoff },
  });
  await tx.providerIncident.updateMany({
    where: { projectId, state: "open" },
    data: { state: "resolved", resolvedAt: cutoff, openSlot: null },
  });
  if (options.retainNotifications) {
    await tx.notification.updateMany({
      where: { projectId, withdrawnAt: null },
      data: { withdrawnAt: cutoff, version: { increment: 1 } },
    });
    await tx.$queryRaw`SELECT set_config('bisibility.retained_notification_projects',
      (COALESCE(NULLIF(current_setting('bisibility.retained_notification_projects', true), ''), '{}')::jsonb
        || jsonb_build_object(${projectId}::text, true))::text, true)`;
  } else {
    await tx.notification.deleteMany({ where: { projectId, type: "provider_incident" } });
  }
}
