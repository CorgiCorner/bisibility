import { prisma } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { resolveEffectiveAllocations } from "./compatibility";

type DbClient = PrismaClient | Prisma.TransactionClient;
const connectionSelect = {
  allocationAmountPerMonth: true,
  allocationUnit: true,
  enabled: true,
  id: true,
  priority: true,
  provider: true,
  status: true,
} as const;

export async function readProjectProviderAllocations(
  internalProjectId: string,
  catalog: readonly ProviderCatalogEntry[],
  db: DbClient = prisma,
) {
  const project = await db.project.findUnique({
    select: {
      budgetCapCents: true,
      providerAllocationsInitializedAt: true,
      providerConnections: { select: connectionSelect },
    },
    where: { id: internalProjectId },
  });
  if (!project) throw new Error("Project not found.");
  return resolveEffectiveAllocations({
    catalog,
    connections: project.providerConnections,
    project,
  });
}
