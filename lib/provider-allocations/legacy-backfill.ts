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
  credentialSource: true,
  creditsAllocationAmountPerMonth: true,
  creditsProgrammaticAllocationAmountPerMonth: true,
  enabled: true,
  id: true,
  priority: true,
  programmaticAllocationAmountPerMonth: true,
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
    data: {
      allocationAmountPerMonth: null,
      allocationUnit: null,
      creditsAllocationAmountPerMonth: null,
      creditsProgrammaticAllocationAmountPerMonth: null,
      programmaticAllocationAmountPerMonth: null,
    },
    where: { projectId: internalProjectId },
  });
  // The legacy project cap seeds both surfaces so the cutover loosens nothing (plan P4).
  // It lands in the budget of the source the primary runs on today: own keys and
  // credits keep separate budgets.
  const hosted =
    project.providerConnections.find((connection) => connection.id === primary.id)
      ?.credentialSource === "hosted";
  await tx.providerConnection.update({
    data: hosted
      ? {
          creditsAllocationAmountPerMonth: project.budgetCapCents,
          creditsProgrammaticAllocationAmountPerMonth: project.budgetCapCents,
        }
      : {
          allocationAmountPerMonth: project.budgetCapCents,
          allocationUnit: "cents",
          programmaticAllocationAmountPerMonth: project.budgetCapCents,
        },
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
