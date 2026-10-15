import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { readDeploymentMeteringEvidence } from "@/lib/providers/execution-extension";
import { z } from "zod";

const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);
const receipt = z.object({ costCents: decimal, quantity: decimal });
type Accounting = {
  uncertain: boolean;
  costCents: number | null;
  quantity: number | null;
  customerCostCents: number | null;
};
const unknown: Accounting = {
  uncertain: true,
  costCents: null,
  quantity: null,
  customerCostCents: null,
};
/** Every admitted attempt must be accounted for; in-memory totals may omit a pending next page. */
export async function comparisonAccounting(input: {
  projectId: string;
  sideId: string;
  connectionId: string;
  fundingSource: "own" | "hosted";
}): Promise<Accounting> {
  const side = await prisma.providerComparisonSide.findFirst({
    where: { id: input.sideId, projectId: input.projectId },
    select: { attemptIds: true },
  });
  if (!side) return unknown;
  if (!side.attemptIds.length)
    return {
      uncertain: false,
      costCents: 0,
      quantity: 0,
      customerCostCents: input.fundingSource === "hosted" ? 0 : null,
    };
  if (input.fundingSource === "hosted") {
    const evidence = await readDeploymentMeteringEvidence(`provider-comparison:${input.sideId}`);
    if (
      !evidence ||
      evidence.snapshot.projectId !== input.projectId ||
      evidence.snapshot.connectionId !== input.connectionId ||
      evidence.snapshot.correlationId !== `comparison:${input.sideId}` ||
      evidence.costCents === null ||
      evidence.usageQuantity === null ||
      evidence.customerCents === null
    )
      return unknown;
    return {
      uncertain: false,
      costCents: Number(evidence.costCents),
      quantity: Number(evidence.usageQuantity),
      customerCostCents: Number(evidence.customerCents),
    };
  }
  const rows = await prisma.meteringUsageEvidence.findMany({
    where: {
      id: { in: side.attemptIds },
      projectId: input.projectId,
      connectionId: input.connectionId,
      correlationId: `comparison:${input.sideId}`,
    },
    select: { id: true, discarded: true, measurementStatus: true, receipt: true },
  });
  if (rows.length !== new Set(side.attemptIds).size) return unknown;
  let costCents = new Prisma.Decimal(0),
    quantity = new Prisma.Decimal(0);
  for (const row of rows) {
    if (row.discarded) continue;
    const parsed = receipt.safeParse(row.receipt);
    if (row.measurementStatus !== "recorded" || !parsed.success) return unknown;
    costCents = costCents.plus(parsed.data.costCents);
    quantity = quantity.plus(parsed.data.quantity);
  }
  return costCents.isFinite() && quantity.isFinite()
    ? {
        uncertain: false,
        costCents: costCents.toNumber(),
        quantity: quantity.toNumber(),
        customerCostCents: null,
      }
    : unknown;
}
