import { writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { ProviderActionResult } from "@usagekit/views";
import type { ProviderUiCommand } from "./schema";
import { connectionRevision, type ProviderUiState } from "./state";

type ChainCommand = Extract<ProviderUiCommand, { kind: "project_chain" }>;

/** Validate every target before writing; the caller owns the locked, journalled transaction. */
export async function mutateProjectChain(
  tx: Prisma.TransactionClient,
  state: ProviderUiState,
  command: ChainCommand,
): Promise<ProviderActionResult | null> {
  const nonce = { commandId: command.commandId };
  if (command.expectedRevision !== state.revision)
    return {
      ...nonce,
      outcome: "conflict",
      reason: "revision_changed",
      currentRevision: state.revision,
    };
  const connections = state.connections.filter(
    (row) =>
      row.status === "connected" &&
      PROVIDER_CATALOG.some((provider) => provider.id === row.provider && provider.kind === "serp"),
  );
  const byId = new Map(connections.map((row) => [row.publicId, row]));
  const planned = command.entries.flatMap((entry) => {
    const connection = byId.get(entry.id);
    return connection ? [{ entry, connection }] : [];
  });
  if (
    command.entries.length !== connections.length ||
    new Set(command.entries.map((row) => row.id)).size !== connections.length ||
    planned.length !== command.entries.length
  )
    return { ...nonce, outcome: "invalid", field: "entries", reason: "incomplete_chain" };
  if (
    planned.some(
      ({ entry, connection }) => entry.expectedRevision !== connectionRevision(state, connection),
    )
  )
    return {
      ...nonce,
      outcome: "conflict",
      reason: "revision_changed",
      currentRevision: state.revision,
    };
  const ordered = [
    ...planned.filter(({ entry }) => entry.enabled),
    ...planned.filter(({ entry }) => !entry.enabled),
  ];
  let active = 0;
  let paused = 100;
  for (const { entry, connection } of ordered) {
    const priority = entry.enabled ? active++ : paused++;
    await tx.providerConnection.update({
      where: { id: connection.id },
      data: { enabled: entry.enabled, priority },
    });
    await writeAudit(
      {
        action: "provider.set_settings",
        actorId: state.actor.id,
        projectId: state.project.id,
        targetId: connection.publicId,
        targetType: "provider_connection",
        before: {
          provider: connection.provider,
          enabled: connection.enabled,
          priority: connection.priority,
        },
        after: { provider: connection.provider, enabled: entry.enabled, priority },
      },
      tx,
    );
  }
  return null;
}
