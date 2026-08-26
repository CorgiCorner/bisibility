import "server-only";

import { requireApiPublicId } from "@/lib/api/public-id";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { backfillLegacyProjectAllocationInLockedTransaction } from "./legacy-backfill";
import { lockProjectForProviderMutation } from "./project-lock";
import type { ProviderAllocation } from "./types";
import { validateProviderAllocation } from "./validation";

export async function setProviderConnectionAllocation(input: {
  actor: Actor;
  allocation: ProviderAllocation | null;
  catalog: readonly ProviderCatalogEntry[];
  connectionPublicId: string;
  projectPublicId: string;
}) {
  const projectPublicId = requireApiPublicId(input.projectPublicId, "prj");
  const connectionPublicId = requireApiPublicId(input.connectionPublicId, "conn");
  return prisma.$transaction(async (tx) => {
    const resolvedProject = await tx.project.findUnique({
      select: { id: true },
      where: { publicId: projectPublicId },
    });
    if (!resolvedProject) throw new Error("Project not found.");
    await lockProjectForProviderMutation(tx, resolvedProject.id);
    const project = await tx.project.findUnique({
      select: { id: true, isSample: true, publicId: true, writeMode: true },
      where: { id: resolvedProject.id },
    });
    if (!project) throw new Error("Project not found.");
    authorize(input.actor, "manage", { projectId: project.id, type: "provider_connection" });
    assertProjectWritable(project);
    const connection = await tx.providerConnection.findFirst({
      select: { allocationAmountPerMonth: true, allocationUnit: true, id: true, provider: true },
      where: { projectId: project.id, publicId: connectionPublicId },
    });
    if (!connection) throw new Error("Provider connection not found.");
    validateProviderAllocation(input.catalog, connection.provider, input.allocation);
    await backfillLegacyProjectAllocationInLockedTransaction(tx, project.id, input.catalog);
    await tx.providerConnection.update({
      data: {
        allocationAmountPerMonth: input.allocation?.amountPerMonth ?? null,
        allocationUnit: input.allocation?.unit ?? null,
      },
      where: { id: connection.id },
    });
    await tx.project.update({
      data: { providerAllocationsInitializedAt: new Date() },
      where: { id: project.id },
    });
    await writeAudit(
      {
        action: "provider.allocation.update",
        actorId: input.actor.id,
        after: input.allocation,
        before:
          connection.allocationUnit && connection.allocationAmountPerMonth
            ? {
                amountPerMonth: connection.allocationAmountPerMonth,
                unit: connection.allocationUnit,
              }
            : null,
        projectId: project.id,
        targetId: requiredPublicAuditId(connectionPublicId, "conn", "Provider connection"),
        targetType: "provider_connection",
      },
      tx,
    );
  });
}
