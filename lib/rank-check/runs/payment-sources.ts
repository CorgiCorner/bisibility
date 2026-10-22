import "server-only";
import { actionPaymentOption, enumerateActionPaymentOptions } from "@/lib/action-payment/options";
import { ActionPaymentError } from "@/lib/action-payment/token";
import { getSerpProvider } from "@/lib/providers/registry";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";

export function rankPaymentOptions(connections: Awaited<ReturnType<typeof loadSerpProviderChain>>) {
  return enumerateActionPaymentOptions(
    connections.flatMap((connection) => {
      if (!connection.publicId || !["own", "hosted"].includes(connection.credentialSource ?? ""))
        return [];
      return [
        {
          connection: {
            publicId: connection.publicId,
            credentialSource: connection.credentialSource as "own" | "hosted",
          },
          provider: getSerpProvider(connection.provider),
        },
      ];
    }),
    "rank_check",
  );
}
export async function loadRankPaymentSources(
  projectId: string,
  providerId?: string,
  paymentOptionId?: string,
  tx?: Parameters<typeof loadSerpProviderChain>[2],
) {
  const connections = await loadSerpProviderChain(projectId, providerId, tx);
  if (!paymentOptionId) return connections;
  const selected = connections.find(
    (connection) =>
      connection.publicId &&
      ["own", "hosted"].includes(connection.credentialSource ?? "") &&
      actionPaymentOption(
        {
          connection: {
            publicId: connection.publicId,
            credentialSource: connection.credentialSource as "own" | "hosted",
          },
          provider: getSerpProvider(connection.provider),
        },
        "rank_check",
      )?.id === paymentOptionId,
  );
  if (!selected) throw new ActionPaymentError("payment_quote_changed");
  return [selected, ...connections.filter((connection) => connection !== selected)];
}
