import { requireProjectSpendingBudget } from "@/lib/metering/project-budget-bootstrap";
import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import type { MeterReserveInput } from "@usagekit/core";
import type { PaidAttemptContext, PaidAttemptOptions } from "./paid-attempt-types";

/** Business locks precede Store accounting locks, matching funding-mutation lock order. */
export async function verifyPaidBinding(
  tx: Prisma.TransactionClient,
  input: MeterReserveInput,
  context: PaidAttemptContext,
  options: PaidAttemptOptions,
) {
  if (options.verifyBinding) return options.verifyBinding(tx, input, context);
  if (input.fundingSource !== "byok")
    throw new Error("Platform credential custody requires a host binding port");
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${context.projectId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${context.connectionId} FOR SHARE`;
  const connection = await tx.providerConnection.findUnique({
    where: { id: context.connectionId },
    select: {
      id: true,
      projectId: true,
      publicId: true,
      provider: true,
      credentialSource: true,
      enabled: true,
      status: true,
      credentialsEncrypted: true,
      project: { select: { ownerId: true } },
    },
  });
  if (
    !connection ||
    connection.projectId !== context.projectId ||
    connection.project.ownerId !== input.scope.principal ||
    connection.publicId !== context.publicConnectionId ||
    connection.provider !== input.provider ||
    connection.credentialSource !== "own" ||
    !connection.enabled ||
    connection.status !== "connected" ||
    ownCredentialVersion(connection.provider, connection.id, connection.credentialsEncrypted) !==
      context.providerCredentialVersion
  )
    throw new Error("Original paid attempt credential binding changed");
  await requireProjectSpendingBudget(tx, input.scope.namespace, context.projectId);
}
