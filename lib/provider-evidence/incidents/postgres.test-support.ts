import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { markRecoveryAttemptStopped } from "@/lib/provider-evidence/recovery/capture";
import { recoveryFixture } from "@/lib/provider-evidence/recovery/postgres.test-support";
import { refreshOperationIncident } from "./refresh";

export async function incidentFixture(projectId?: string, now?: Date) {
  const f = await recoveryFixture({ now });
  if (projectId) {
    await prisma.keyword.update({ where: { id: f.keyword.id }, data: { projectId } });
    await prisma.providerDispatchIdentity.update({
      where: { operationPk: f.operationPk },
      data: { projectId },
    });
  }
  return f;
}
export async function enqueueIncident(f: Awaited<ReturnType<typeof recoveryFixture>>) {
  await markRecoveryAttemptStopped(f.check.id, "workflow_failed");
  const link = await prisma.providerIncidentOperation.findUniqueOrThrow({
    where: { operationPk: f.operationPk },
  });
  return prisma.providerIncident.findUniqueOrThrow({ where: { id: link.incidentId } });
}
export async function changeDimensions(
  operationPk: string,
  data: Prisma.ProviderOperationEvidenceUpdateInput,
) {
  return prisma.$transaction(async (tx) => {
    await tx.providerOperationEvidence.update({ where: { operationPk }, data });
    await refreshOperationIncident(tx, operationPk);
  });
}
export const resolvedDimensions = {
  acceptance: "accepted",
  fulfillment: "complete",
  accounting: "measured",
  exhaustionStatus: "not_applicable",
} as const;
export async function incidentRows() {
  return {
    incidents: await prisma.providerIncident.findMany({ orderBy: { id: "asc" } }),
    transitions: await prisma.providerIncidentTransition.findMany({ orderBy: { id: "asc" } }),
    notifications: await prisma.notification.findMany({
      where: { type: "provider_incident" },
      orderBy: { id: "asc" },
    }),
  };
}
