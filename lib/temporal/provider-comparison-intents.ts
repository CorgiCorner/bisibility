import "server-only";
import { prisma } from "../db/prisma";
import { startProviderComparisonWorkflow } from "./provider-comparison-client";
export async function dispatchProviderComparisonIntents() {
  const runs = await prisma.providerComparisonRun.findMany({
    where: { sides: { some: { status: "queued" } } },
    take: 50,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, projectId: true },
  });
  let started = 0;
  for (const run of runs) {
    await startProviderComparisonWorkflow(run.projectId, run.id);
    started += 1;
  }
  return { started };
}
