import { updateProviderConnectionRateInTransaction } from "@/lib/api/provider-rate-service";
import type { Prisma } from "@/lib/generated/prisma/client";
import { setProviderConnectionAllocationInTransaction } from "@/lib/provider-allocations/service";
import { providerRateFeatures } from "@/lib/provider-rates/catalog";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { ProviderActionResult } from "@usagekit/views";
import { allocationUpdates } from "./allocations";
import { mutateProjectChain } from "./project-chain";
import type { ProviderUiCommand } from "./schema";
import { connectionRevision, type ProviderUiState } from "./state";

export async function mutateProviderUi(
  tx: Prisma.TransactionClient,
  state: ProviderUiState,
  command: ProviderUiCommand,
): Promise<ProviderActionResult | null> {
  const nonce = { commandId: command.commandId };
  if (!state.binding.canManage) return { ...nonce, outcome: "forbidden" };
  if (command.kind === "project_chain") return mutateProjectChain(tx, state, command);
  if (command.kind === "rates") {
    const connection = state.connections.find((row) => row.publicId === command.connectionId);
    if (!connection) return { ...nonce, outcome: "forbidden" };
    if (command.expectedRevision !== connectionRevision(state, connection))
      return {
        ...nonce,
        outcome: "conflict",
        reason: "revision_changed",
        currentRevision: connectionRevision(state, connection),
      };
    const features = providerRateFeatures(connection.provider);
    if (
      connection.credentialSource !== "own" ||
      command.rates.some((rate) => !features.includes(rate.rateId))
    )
      return { ...nonce, outcome: "invalid", field: "rates", reason: "unsupported_rate" };
    for (const rate of command.rates)
      await updateProviderConnectionRateInTransaction(
        tx,
        {
          providerId: connection.provider,
          feature: rate.rateId,
          amountCents: rate.price,
        },
        { actorId: state.actor.id, projectId: state.project.id },
      );
    return null;
  }
  if (command.expectedRevision !== state.revision)
    return {
      ...nonce,
      outcome: "conflict",
      reason: "revision_changed",
      currentRevision: state.revision,
    };
  const planned = allocationUpdates(state, command);
  if (planned.outcome !== "valid") return { ...nonce, ...planned };
  if (!planned.updates.size) return null;
  for (const [connectionPublicId, allocations] of planned.updates)
    await setProviderConnectionAllocationInTransaction(tx, {
      actor: state.actor,
      allocations,
      catalog: PROVIDER_CATALOG,
      connectionPublicId,
      projectPublicId: state.project.publicId,
    });
  return null;
}
