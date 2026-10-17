import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { recoveryErrorCode } from "@/lib/provider-usage/recovery-error";
import { recoveryCommandSchema } from "./command-input";

export const RECOVERY_TRANSIENT_RETRIES = 2;
/** Only retries the rolled-back recovery transaction; this module cannot dispatch providers. */
export async function deferTransientRecovery(
  database: PrismaClient,
  namespace: string,
  commandId: string,
  leaseId: string,
  error: unknown,
  expectedOutcome: number,
) {
  if (
    !["transaction_timeout", "transaction_conflict", "store_unavailable"].includes(
      recoveryErrorCode(error),
    )
  )
    return false;
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "commandId" FROM metering_recovery_commands WHERE namespace=${namespace} AND "commandId"=${commandId} FOR UPDATE`;
    const current = await tx.meteringRecoveryCommand.findUniqueOrThrow({
      where: { namespace_commandId: { namespace, commandId } },
    });
    if (current.state !== "running" || current.leaseId !== leaseId) return true;
    const outcomeCount = Array.isArray(current.result) ? current.result.length : 0;
    if (outcomeCount !== expectedOutcome) return true;
    const input = recoveryCommandSchema.parse(current.input);
    const index = String(outcomeCount);
    const attempts = input.retries?.[index] ?? 0;
    if (attempts >= RECOVERY_TRANSIENT_RETRIES) return false;
    await tx.meteringRecoveryCommand.update({
      where: { namespace_commandId: { namespace, commandId } },
      data: {
        input: {
          ...input,
          retries: { ...input.retries, [index]: attempts + 1 },
        } as Prisma.InputJsonValue,
        state: "queued",
        leaseId: null,
        leaseExpiresAt: new Date(Date.now() + 10000 * (attempts + 1)),
      },
    });
    return true;
  });
}
