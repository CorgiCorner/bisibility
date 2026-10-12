import { prisma } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { platformAllocationTag } from "@/lib/metering/paid-quote";
import { meteringNamespace } from "@/lib/metering/runtime";
import { readSpendingBudgets } from "@/lib/metering/spending-limit-store";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { storeAllocations } from "./store-projection";
import type { EffectiveProviderAllocation } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;
export async function readProjectProviderAllocations(
  internalProjectId: string,
  catalog: readonly ProviderCatalogEntry[],
  db: DbClient = prisma,
): Promise<EffectiveProviderAllocation[]> {
  const read = async (tx: Prisma.TransactionClient) => {
    const project = await tx.project.findUnique({
      select: { providerConnections: { select: { id: true, provider: true } } },
      where: { id: internalProjectId },
    });
    if (!project) throw new Error("Project not found.");
    const connections = project.providerConnections.filter(
      (c) => catalog.find((p) => p.id === c.provider)?.allocation?.kind === "billable",
    );
    if (!connections.length) return [];
    const namespace = meteringNamespace();
    const budgets = await readSpendingBudgets(
      tx,
      namespace,
      connections.flatMap((c) => [
        { kind: "tag" as const, namespace, tag: ownAllocationTag(c.provider, c.id) },
        { kind: "tag" as const, namespace, tag: platformAllocationTag(c.provider, c.id) },
      ]),
    );
    return connections.map((c) => {
      const stored = storeAllocations(budgets, c.id);
      return {
        allocation: stored.app,
        programmaticAllocation: stored.programmatic,
        credits: stored.credits,
        internalConnectionId: c.id,
        source: stored.app || stored.programmatic ? ("connection" as const) : ("none" as const),
      };
    });
  };
  return "$transaction" in db ? db.$transaction(read) : read(db);
}
