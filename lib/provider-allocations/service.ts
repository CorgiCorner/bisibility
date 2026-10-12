import "server-only";
import { requireApiPublicId } from "@/lib/api/public-id";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { platformAllocationTag } from "@/lib/metering/paid-quote";
import { meteringNamespace } from "@/lib/metering/runtime";
import { putSpendingBudget, readSpendingBudgets } from "@/lib/metering/spending-limit-store";
import { fundingSpendingBudgets } from "@/lib/metering/spending-limits";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { lockProjectForProviderMutation } from "./project-lock";
import { storeAllocations } from "./store-projection";
import type { ProviderConnectionAllocations, ProviderConnectionAllocationUpdate } from "./types";
import { catalogEntry, validateProviderConnectionAllocations } from "./validation";

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

export type ProviderAllocationMutationInput = {
  actor: Actor;
  allocations: ProviderConnectionAllocationUpdate;
  /** Audit attribution when it differs from the authorizing actor (project API keys: null). */
  auditActorId?: string | null;
  catalog: readonly ProviderCatalogEntry[];
  connectionPublicId: string;
  projectPublicId: string;
};
export async function setProviderConnectionAllocation(input: ProviderAllocationMutationInput) {
  requireApiPublicId(input.projectPublicId, "prj");
  requireApiPublicId(input.connectionPublicId, "conn");
  return prisma.$transaction((tx) => setProviderConnectionAllocationInTransaction(tx, input));
}

export async function setProviderConnectionAllocationInTransaction(
  tx: Prisma.TransactionClient,
  input: ProviderAllocationMutationInput,
) {
  const projectPublicId = requireApiPublicId(input.projectPublicId, "prj");
  const connectionPublicId = requireApiPublicId(input.connectionPublicId, "conn");
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
    select: { id: true, provider: true },
    where: { projectId: project.id, publicId: connectionPublicId },
  });
  if (!connection) throw new Error("Provider connection not found.");
  validateProviderConnectionAllocations(input.catalog, connection.provider, input.allocations);
  const metadata = catalogEntry(input.catalog, connection.provider).allocation;
  if (metadata.kind !== "billable")
    throw new Error("Non-billable providers cannot have spending limits.");
  const namespace = meteringNamespace();
  const budgets = await readSpendingBudgets(tx, namespace, [
    { kind: "tag", namespace, tag: ownAllocationTag(connection.provider, connection.id) },
    { kind: "tag", namespace, tag: platformAllocationTag(connection.provider, connection.id) },
  ]);
  if (
    budgets.some(
      (b) =>
        b.id.startsWith(`own-connection:${connection.id}:`) && b.unit !== metadata.allocationUnit,
    )
  )
    throw new Error("Stored native spending limit unit changed; reconcile its counters first");
  const before = storeAllocations(budgets, connection.id);
  const after = mergedAllocations(before, input.allocations);
  for (const funding of ["byok", "platform"] as const) {
    const update = funding === "byok" ? input.allocations : input.allocations.credits;
    const values = funding === "byok" ? after : after.credits;
    const definitions = fundingSpendingBudgets(
      namespace,
      {
        id: connection.id,
        provider: connection.provider,
        unit: metadata.allocationUnit,
        app: values.app === null ? null : String(values.app.amountPerMonth),
        programmatic:
          values.programmatic === null ? null : String(values.programmatic.amountPerMonth),
      },
      funding,
      1,
    );
    for (const budget of definitions) {
      if (update?.[budget.surface as "app" | "programmatic"] === undefined) continue;
      const current = budgets.find((b) => b.id === budget.id);
      await putSpendingBudget(tx, { ...budget, version: (current?.version ?? 0) + 1 });
    }
  }
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
}
