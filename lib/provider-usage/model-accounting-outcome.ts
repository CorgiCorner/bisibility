import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

export async function recordModelAccountingOutcome(
  tx: Prisma.TransactionClient,
  observationId: string,
  status: string,
  reason: string | null,
) {
  const [schema] = await tx.$queryRaw<
    { available: boolean }[]
  >`SELECT to_regclass('model_playground_runs') IS NOT NULL AS available`;
  if (!schema.available) {
    await tx.$executeRaw`UPDATE model_playground_payment_observations SET accounting_status=${status},accounting_reason=${reason} WHERE id=${observationId}`;
    return;
  }
  // Accounting-only recovery can change a saved report without changing its answer.
  await tx.$executeRaw`WITH changed AS (
    UPDATE model_playground_payment_observations SET accounting_status=${status},accounting_reason=${reason}
    WHERE id=${observationId} AND (accounting_status,accounting_reason) IS DISTINCT FROM (${status},${reason})
    RETURNING attempt_id
  ) UPDATE model_playground_runs r SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL
    FROM model_playground_payment_attempts a,changed c
    WHERE a.id=c.attempt_id AND COALESCE(a.root_quote_id,a.quote_id)=r."previewId"
      AND r."projectId"=a.binding->>'projectId' AND r."terminalAt" IS NOT NULL`;
}
