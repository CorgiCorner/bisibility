import type { CostReceipt, SamplePlan, TrackingPageInput } from "@/lib/ai-tracking/contract";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { meterOperationReference, receiptOperationId } from "@/lib/metering/operation-reference";
import { readCanonicalUsage } from "@/lib/metering/usage-read";
import { trackingCursor, trackingPage } from "./cursor";
export async function listTrackingSamples(
  projectId: string,
  runId: string,
  input: TrackingPageInput = {},
) {
  const { limit, where } = trackingCursor(input);
  const rows = await prisma.aiTrackingSample.findMany({
    where: { projectId, runId, ...where },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { citations: true, observations: true, promptRevision: true },
  });
  const page = trackingPage(rows, limit);
  const ids = page.items.flatMap((row) => {
    const id = receiptOperationId(row.receipt);
    return id ? [id, `legacy:${id}`] : [];
  });
  const usage = ids.length
    ? await readCanonicalUsage(Prisma.sql`"projectId"=${projectId} AND id IN (${Prisma.join(ids)})`)
    : [];
  return {
    ...page,
    items: page.items.map((row) => {
      const old = row.receipt as unknown as CostReceipt | null;
      const id = receiptOperationId(old);
      if (
        old?.noDispatch &&
        !id &&
        old.amountUsd === "0" &&
        old.state === "confirmed" &&
        row.dispatch === "terminal" &&
        !row.providerTaskId
      ) {
        return { ...row, receipt: old as unknown as Prisma.JsonValue };
      }
      const plan = row.plan as unknown as SamplePlan;
      const found = usage.find(
        (u) =>
          (u.id === id || u.id === `legacy:${id}`) &&
          u.connectionId === plan.credentialConnectionId &&
          u.providerCredentialVersion === plan.credentialVersion,
      );
      const known = found?.measurementStatus === "recorded" && found.costCents !== null;
      return {
        ...row,
        receipt: {
          providerCostEntryId: null,
          operationRef: found
            ? meterOperationReference(found.id, found.namespace)
            : (old?.operationRef ?? null),
          amountUsd: known ? (found.costCents?.div(100).toString() ?? null) : null,
          state: known ? "confirmed" : "unknown",
        } as Prisma.JsonValue,
      };
    }),
  };
}
