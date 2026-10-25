import "server-only";
import type { Prisma, ProviderIncident } from "@/lib/generated/prisma/client";
import { upsertNotification } from "@/lib/notifications/upsert";
import { recoverySwitches } from "@/lib/provider-evidence/recovery/switches";
import { appPath } from "@/lib/routing/app-path";
import { emptyIncidentCounts, type IncidentCounts } from "./dimensions";

/** No surface filter: incidents cover app, worker, API, SDK, CLI and MCP alike. */
export async function deliverIncident(
  tx: Prisma.TransactionClient,
  incident: ProviderIncident,
  addedUnresolvedOperation: boolean,
) {
  if (!recoverySwitches().incidentBell || incident.retiredAt) return;
  const project = await tx.project.findUnique({
    where: { id: incident.projectId },
    select: { publicId: true, ownerId: true, members: { select: { userId: true } } },
  });
  if (!project) return;
  const latestUnresolvedLink = await tx.providerIncidentTransition.findFirst({
    where: {
      incidentId: incident.id,
      counts: { path: ["addedUnresolvedOperation"], equals: true },
    },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const unresolvedAddedVersion = latestUnresolvedLink?.version ?? 0;
  const counts = emptyIncidentCounts();
  for (const key of Object.keys(counts) as Array<keyof IncidentCounts>) counts[key] = incident[key];
  const payload = {
    incidentId: incident.id,
    cause: incident.cause,
    state: incident.state,
    ...counts,
    version: incident.version,
    unresolvedAddedVersion,
    href: appPath(project.publicId, "runs"),
  };
  const recipients = new Set([project.ownerId, ...project.members.map((member) => member.userId)]);
  for (const userId of recipients)
    await upsertNotification(
      {
        userId,
        projectId: incident.projectId,
        type: "provider_incident",
        title: "provider_incident",
        payload,
        version: incident.version,
        idempotencyKey: `provider-incident:${incident.id}`,
        addedUnresolvedOperation,
        unresolvedAddedVersion,
      },
      tx,
    );
}
