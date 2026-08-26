import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { primaryEligibleMeteredConnection } from "./compatibility";
import { lockProjectForProviderMutation } from "./project-lock";
import { retrySerializableTransaction } from "./transaction-retry";
import { validateAllocationAmount } from "./validation";

export type LegacyAllocationBackfillResult =
  | { internalPrimaryConnectionId: string; status: "backfilled" }
  | { internalPrimaryConnectionId: null; status: "already_backfilled" | "deferred_no_eligible" };

const connectionSelect = {
  allocationAmountPerMonth: true,
  allocationUnit: true,
  enabled: true,
  id: true,
  priority: true,
  provider: true,
  status: true,
} as const;

type LegacyBackfillClient = Pick<Prisma.TransactionClient, "project" | "providerConnection">;

export async function backfillLegacyProjectAllocationInLockedTransaction(
  tx: LegacyBackfillClient,
  internalProjectId: string,
  catalog: readonly ProviderCatalogEntry[],
): Promise<LegacyAllocationBackfillResult> {
  const project = await tx.project.findUnique({
    select: {
      budgetCapCents: true,
      providerAllocationsInitializedAt: true,
      providerConnections: { select: connectionSelect },
    },
    where: { id: internalProjectId },
  });
  if (!project) throw new Error("Project not found.");
  if (project.providerAllocationsInitializedAt) {
    return { internalPrimaryConnectionId: null, status: "already_backfilled" };
  }
  const primary = primaryEligibleMeteredConnection(project.providerConnections, catalog);
  if (!primary) return { internalPrimaryConnectionId: null, status: "deferred_no_eligible" };
  validateAllocationAmount(project.budgetCapCents);
  await tx.providerConnection.updateMany({
    data: { allocationAmountPerMonth: null, allocationUnit: null },
    where: { projectId: internalProjectId },
  });
  await tx.providerConnection.update({
    data: { allocationAmountPerMonth: project.budgetCapCents, allocationUnit: "cents" },
    where: { id: primary.id },
  });
  await tx.project.update({
    data: { providerAllocationsInitializedAt: new Date() },
    where: { id: internalProjectId },
  });
  return { internalPrimaryConnectionId: primary.id, status: "backfilled" };
}

export async function backfillLegacyProjectAllocation(
  internalProjectId: string,
  catalog: readonly ProviderCatalogEntry[],
): Promise<LegacyAllocationBackfillResult> {
  return retrySerializableTransaction(() =>
    prisma.$transaction(
      async (tx) => {
        await lockProjectForProviderMutation(tx, internalProjectId);
        return backfillLegacyProjectAllocationInLockedTransaction(tx, internalProjectId, catalog);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
