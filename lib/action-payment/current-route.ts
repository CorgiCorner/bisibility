import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PaymentTokenPayload } from "./token";
import { ActionPaymentError, paymentFingerprint } from "./token";

export async function currentPaymentRoute(projectId: string, payload: PaymentTokenPayload) {
  const connection = await prisma.providerConnection.findFirst({
    where: { projectId, publicId: payload.option.connectionId },
    select: {
      id: true,
      credentialSource: true,
      credentialsEncrypted: true,
      provider: true,
      enabled: true,
      status: true,
      project: { select: { ownerId: true } },
    },
  });
  if (
    !connection ||
    !connection.enabled ||
    connection.status !== "connected" ||
    connection.provider !== payload.option.providerId ||
    paymentFingerprint([
      projectId,
      connection.project.ownerId,
      connection.id,
      connection.credentialSource,
      connection.credentialsEncrypted,
      payload.option,
    ]) !== payload.route
  )
    throw new ActionPaymentError("payment_quote_changed");
  return connection;
}
