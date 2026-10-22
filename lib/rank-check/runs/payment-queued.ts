import "server-only";
import { composePaymentGuards } from "@/lib/action-payment/compose-guards";
import { ActionPaymentError } from "@/lib/action-payment/token";
import { Prisma } from "@/lib/generated/prisma/client";
import type { WorkerDefinitionSession } from "@/lib/measurement-definitions/worker-session";
import type { claimQueuedSubmission } from "@/lib/rank-check/queued-submit-claim";
import { rankPaymentExecution, retainedRankPayment } from "./payment-runtime";

export async function queuedRankPaymentSessions(
  batch: Awaited<ReturnType<typeof claimQueuedSubmission>>["batch"],
  definitions: ReadonlyMap<string, WorkerDefinitionSession>,
) {
  if (!batch.connection) throw new ActionPaymentError("payment_quote_changed");
  const result = new Map(definitions);
  for (const task of batch.tasks) {
    const { payment } = await rankPaymentExecution(
      task.rankCheckId,
      [batch.connection],
      batch.projectId,
    );
    if (!payment) continue;
    const original = result.get(task.id);
    if (!original) throw new ActionPaymentError("payment_quote_changed");
    result.set(task.id, { ...original, ...composePaymentGuards(original, payment.guard) });
  }
  return result;
}
/** Monetary admission cap stays cents; native provider quantities never enter this field. */
export async function queuedRankPaymentLimit(checkId: string) {
  const retained = await retainedRankPayment(checkId);
  if (!retained || retained.consent.option.fundingSource !== "byok") return undefined;
  const { payableUnit } = retained.consent.option;
  return payableUnit.kind === "currency" && payableUnit.code === "USD"
    ? new Prisma.Decimal(retained.target.amount).times(100).toFixed()
    : undefined;
}
