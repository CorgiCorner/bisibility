import "server-only";
import { requireApiPublicId } from "@/lib/api/public-id";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import {
  guardConnectionBudgetMutation,
  mirrorConnectionBudgetsSafely,
} from "@/lib/metering/budget-mirror";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { backfillLegacyProjectAllocationInLockedTransaction } from "./legacy-backfill";
import { lockProjectForProviderMutation } from "./project-lock";
import type {
  ProviderAllocation,
  ProviderConnectionAllocations,
  ProviderConnectionAllocationUpdate,
  StoredProviderAllocation,
} from "./types";
import { catalogEntry, validateProviderConnectionAllocations } from "./validation";

const storedAllocationSelect = {
  allocationAmountPerMonth: true,
  allocationUnit: true,
  creditsAllocationAmountPerMonth: true,
  creditsProgrammaticAllocationAmountPerMonth: true,
  programmaticAllocationAmountPerMonth: true,
} as const;

function creditsAllocation(amount: number | null | undefined) {
  return amount == null ? null : { amountPerMonth: amount, unit: "cents" as const };
}

export function storedAllocations(
  connection: StoredProviderAllocation,
  catalogUnit: ProviderAllocation["unit"] | null = null,
): ProviderConnectionAllocations {
  const app =
    connection.allocationUnit && connection.allocationAmountPerMonth
      ? {
          amountPerMonth: connection.allocationAmountPerMonth,
          unit: connection.allocationUnit,
        }
      : null;
  // The unit column is paired with the app amount, so a programmatic-only cap
  // falls back to the catalog unit it was validated against.
  const programmaticUnit = connection.allocationUnit ?? catalogUnit;
  const programmatic =
    connection.programmaticAllocationAmountPerMonth != null && programmaticUnit
      ? {
          amountPerMonth: connection.programmaticAllocationAmountPerMonth,
          unit: programmaticUnit,
        }
      : null;
  return {
    app,
    credits: {
      app: creditsAllocation(connection.creditsAllocationAmountPerMonth),
      programmatic: creditsAllocation(connection.creditsProgrammaticAllocationAmountPerMonth),
    },
    programmatic,
  };
}

function allocationUpdateData(update: ProviderConnectionAllocationUpdate) {
  return {
    ...(update.app !== undefined
      ? {
          allocationAmountPerMonth: update.app?.amountPerMonth ?? null,
          allocationUnit: update.app?.unit ?? null,
        }
      : {}),
    ...(update.programmatic !== undefined
      ? { programmaticAllocationAmountPerMonth: update.programmatic?.amountPerMonth ?? null }
      : {}),
    ...(update.credits?.app !== undefined
      ? { creditsAllocationAmountPerMonth: update.credits.app?.amountPerMonth ?? null }
      : {}),
    ...(update.credits?.programmatic !== undefined
      ? {
          creditsProgrammaticAllocationAmountPerMonth:
            update.credits.programmatic?.amountPerMonth ?? null,
        }
      : {}),
  };
}

function mergedAllocations(
  before: ProviderConnectionAllocations,
  update: ProviderConnectionAllocationUpdate,
): ProviderConnectionAllocations {
  return {
    app: update.app !== undefined ? update.app : before.app,
    credits: {
      app: update.credits?.app !== undefined ? update.credits.app : before.credits.app,
      programmatic:
        update.credits?.programmatic !== undefined
          ? update.credits.programmatic
          : before.credits.programmatic,
    },
    programmatic: update.programmatic !== undefined ? update.programmatic : before.programmatic,
  };
}

export async function setProviderConnectionAllocation(input: {
  actor: Actor;
  allocations: ProviderConnectionAllocationUpdate;
  /** Audit attribution when it differs from the authorizing actor (project API keys: null). */
  auditActorId?: string | null;
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
      select: { ...storedAllocationSelect, id: true, provider: true },
      where: { projectId: project.id, publicId: connectionPublicId },
    });
    if (!connection) throw new Error("Provider connection not found.");
    await guardConnectionBudgetMutation(tx, connection.id);
    validateProviderConnectionAllocations(input.catalog, connection.provider, input.allocations);
    await backfillLegacyProjectAllocationInLockedTransaction(tx, project.id, input.catalog);
    const metadata = catalogEntry(input.catalog, connection.provider).allocation;
    const before = storedAllocations(
      connection,
      metadata.kind === "billable" ? metadata.allocationUnit : null,
    );
    const after = mergedAllocations(before, input.allocations);
    await tx.providerConnection.update({
      data: allocationUpdateData(input.allocations),
      where: { id: connection.id },
    });
    await mirrorConnectionBudgetsSafely(tx, connection.id);
    await tx.project.update({
      data: { providerAllocationsInitializedAt: new Date() },
      where: { id: project.id },
    });
    await writeAudit(
      {
        action: "provider.allocation.update",
        actorId: input.auditActorId !== undefined ? input.auditActorId : input.actor.id,
        after,
        before,
        projectId: project.id,
        targetId: requiredPublicAuditId(connectionPublicId, "conn", "Provider connection"),
        targetType: "provider_connection",
      },
      tx,
    );
    return after;
  });
}
