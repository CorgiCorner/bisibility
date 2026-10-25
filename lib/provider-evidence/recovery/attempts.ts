import { providerRecoveryScope } from "./scope";
import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { RecoveryDimensions } from "./predicate";

export async function recoveryAttempts(tx: Prisma.TransactionClient, rankCheckId: string) {
  return tx.meteringPaidAttemptContext.findMany({
    where: {
      namespace: providerRecoveryScope().namespace,
      context: { path: ["rankCheckId"], equals: rankCheckId },
    },
    include: {
      operation: {
        include: {
          providerDispatchIdentity: true,
          providerOperationEvidence: true,
          receipts: { orderBy: { sequence: "desc" }, take: 1, include: { measurements: true } },
        },
      },
    },
  });
}
export type RecoveryAttempt = Awaited<ReturnType<typeof recoveryAttempts>>[number];

export function attemptDimensions(
  attempt: RecoveryAttempt,
  check: { status: string; provider: string },
): RecoveryDimensions {
  const evidence = attempt.operation.providerOperationEvidence;
  const receipt = attempt.operation.receipts[0];
  const identity = attempt.operation.providerDispatchIdentity;
  const measured =
    receipt?.cost_certainty === "measured" &&
    receipt.measurements.every((m) => m.certainty === "measured");
  const input = attempt.operation.input;
  const provider =
    identity?.provider ??
    (input &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    typeof input.provider === "string"
      ? input.provider
      : null);
  const winner = check.status === "completed" && check.provider === provider;
  return {
    acceptance: evidence?.acceptance ?? (receipt ? "accepted" : "unconfirmed"),
    fulfillment: evidence?.fulfillment ?? (winner ? "complete" : "absent"),
    accounting: evidence?.accounting ?? (measured ? "measured" : "unknown"),
  };
}
