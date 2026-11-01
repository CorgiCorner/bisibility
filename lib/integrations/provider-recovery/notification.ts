import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { upsertNotification } from "@/lib/notifications/upsert";
import { recoverySwitches } from "@/lib/provider-evidence/recovery/switches";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { appPath } from "@/lib/routing/app-path";

export async function deliverAccountIncident(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    connectionId: string;
    incidentId: string;
    provider: string;
    reason: string;
    resolved?: boolean;
  },
) {
  if (!recoverySwitches().incidentBell) return;
  const project = await tx.project.findUnique({
    where: { id: input.projectId },
    select: { publicId: true, ownerId: true, members: { select: { userId: true } } },
  });
  if (!project) return;
  const provider =
    PROVIDER_CATALOG.find((entry) => entry.id === input.provider)?.label ?? input.provider;
  for (const userId of new Set([
    project.ownerId,
    ...project.members.map((member) => member.userId),
  ]))
    await upsertNotification(
      {
        userId,
        projectId: input.projectId,
        type: "provider_incident",
        title: "provider_incident",
        payload: {
          kind: "account_block",
          provider,
          reason: input.reason,
          state: input.resolved ? "resolved" : "open",
          href: appPath(project.publicId, "providers"),
        },
        idempotencyKey: `provider-account:${input.connectionId}:${input.incidentId}`,
        version: input.resolved ? 2 : 1,
      },
      tx,
    );
}
