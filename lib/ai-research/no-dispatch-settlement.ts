import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { syncUsageEntry } from "@/lib/metering/entry-sync";

type Scope = { projectId: string; connectionId: string; tags: string[] };

/** Only persisted, explicit proof that the paid transport was never invoked permits zero settlement. */
export async function settleNoDispatchInTransaction(tx: Prisma.TransactionClient, scope: Scope) {
  if (!scope.tags.length) return [];
  const where = {
    projectId: scope.projectId,
    connectionId: scope.connectionId,
    provider: "dataforseo",
    feature: "prompt_explorer" as const,
    credentialSource: "own" as const,
    tag: { in: scope.tags },
    measurementStatus: "unknown",
    providerRequestId: null,
  };
  const rows = await tx.providerCostEntry.findMany({ where, select: { id: true } });
  if (rows.length)
    await tx.providerCostEntry.updateMany({
      where: { ...where, id: { in: rows.map((row) => row.id) } },
      data: { measurementStatus: "recorded", costCents: 0, usageQuantity: 0, failed: true },
    });
  return rows.map((row) => row.id);
}

export async function settleNoDispatch(scope: Scope) {
  const ids = await prisma.$transaction((tx) => settleNoDispatchInTransaction(tx, scope));
  // Read and synchronize only after the zero receipt has committed.
  await Promise.all(ids.map((id) => syncUsageEntry(id)));
}

/** Recover a late journal commit only by matching trusted producer proof, never by absent receipts. */
export async function settleLateNoDispatch(
  tx: Prisma.TransactionClient,
  projectId: string,
  connectionId: string,
) {
  const rows = await tx.providerCostEntry.findMany({
    where: {
      projectId,
      connectionId,
      provider: "dataforseo",
      feature: "prompt_explorer",
      credentialSource: "own",
      measurementStatus: "unknown",
      providerRequestId: null,
      tag: { not: null },
    },
    select: { tag: true },
    take: 10,
  });
  const ids: string[] = [];
  for (const row of rows) {
    if (!row.tag) continue;
    const proof = await tx.agentReport.findFirst({
      where: {
        projectId,
        kind: "prompt_explorer",
        AND: [
          { provenance: { path: ["costPolicy"], equals: "provider_actual_cost" } },
          { provenance: { path: ["actualCostState"], equals: "refused" } },
          { provenance: { path: ["connectionId"], equals: connectionId } },
          { provenance: { path: ["noDispatchTags"], array_contains: [row.tag] } },
        ],
      },
      select: { id: true },
    });
    if (proof)
      ids.push(
        ...(await settleNoDispatchInTransaction(tx, { projectId, connectionId, tags: [row.tag] })),
      );
  }
  return ids;
}
