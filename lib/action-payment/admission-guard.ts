import "server-only";
import type { NativeRequestGuard } from "@/lib/metering/paid-attempt-types";
import { assertDeploymentPayment } from "./deployment-extension";
import { ActionPaymentError, readPaymentToken } from "./token";

export function actionPaymentGuard(input: {
  token: string;
  projectId: string;
  ownerId: string;
  source: "own" | "hosted";
  connection: { id: string; provider: string; credentialsEncrypted: string | null };
  operationKey: string;
  authority: string;
}): NativeRequestGuard {
  const frozen = { ...input, connection: { ...input.connection } };
  return {
    lockBusiness: async (tx) => {
      await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${frozen.connection.id} FOR UPDATE`;
    },
    assertRequest: async (tx) => {
      readPaymentToken(frozen.token);
      const row = await tx.providerConnection.findUnique({
        where: { id: frozen.connection.id },
        select: {
          projectId: true,
          provider: true,
          credentialSource: true,
          credentialsEncrypted: true,
          enabled: true,
          status: true,
          project: { select: { ownerId: true } },
        },
      });
      if (
        !row ||
        row.projectId !== frozen.projectId ||
        row.provider !== frozen.connection.provider ||
        row.credentialSource !== frozen.source ||
        !row.enabled ||
        row.status !== "connected" ||
        row.project.ownerId !== frozen.ownerId ||
        (frozen.source === "own" &&
          row.credentialsEncrypted !== frozen.connection.credentialsEncrypted)
      )
        throw new ActionPaymentError("payment_quote_changed");
      if (frozen.source === "hosted")
        await assertDeploymentPayment(frozen.operationKey, frozen.authority, tx);
    },
  };
}
