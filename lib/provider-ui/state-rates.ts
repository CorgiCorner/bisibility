import type { Prisma } from "@/lib/generated/prisma/client";
import type { ProviderQuery, ProviderRate } from "@usagekit/views";
import { platformConnectionRates } from "./allocation-extension";
import { loadNativeProviderRates } from "./native-rates";
import { connectionRates } from "./rates";
import type { ProviderUiState } from "./state";

/** Only display reads need prices; binding and mutation authority never depend on them. */
export async function loadProviderUiRates(
  tx: Prisma.TransactionClient,
  state: ProviderUiState,
  query: ProviderQuery,
): Promise<void> {
  if (query.kind !== "connections" && query.kind !== "details") return;
  const byProvider = new Map<string, ProviderRate[]>();
  for (const connection of state.connections) {
    if (query.kind === "details" && connection.publicId !== query.connectionId) continue;
    if (query.kind === "connections" && query.provider && connection.provider !== query.provider)
      continue;
    if (connection.credentialSource === "own") {
      state.nativeRates[connection.publicId] = await loadNativeProviderRates(tx, state, connection);
      continue;
    }
    let rates = byProvider.get(connection.provider);
    if (!rates) {
      rates = await platformConnectionRates(
        tx,
        connection.provider,
        connectionRates(connection, false),
      );
      byProvider.set(connection.provider, rates);
    }
    state.platformRates[connection.publicId] = rates;
  }
}
