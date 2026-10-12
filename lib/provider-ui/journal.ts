import { Prisma } from "@/lib/generated/prisma/client";
import type { ProviderActionResult } from "@usagekit/views";
import type { ProviderUiCommand } from "./schema";
import { fingerprint, type ProviderUiState } from "./state";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export const commandHash = (command: ProviderUiCommand) => fingerprint(canonical(command));
export async function retainedCommand(
  tx: Prisma.TransactionClient,
  state: ProviderUiState,
  command: ProviderUiCommand,
) {
  const rows = await tx.$queryRaw<{ bodyHash: string; result: ProviderActionResult }[]>`
    SELECT "bodyHash", result FROM provider_ui_commands WHERE scope=${state.binding.scopeKey}
      AND principal=${state.actor.id} AND "commandId"=${command.commandId}`;
  if (!rows[0]) return null;
  if (rows[0].bodyHash !== commandHash(command))
    return {
      commandId: command.commandId,
      outcome: "invalid" as const,
      field: "commandId",
      reason: "nonce_body_changed",
    };
  return rows[0].result;
}

/** Only committed, neutral results are retained; credentials and mutable connection DTOs never enter this table. */
export async function retainCommand(
  tx: Prisma.TransactionClient,
  state: ProviderUiState,
  command: ProviderUiCommand,
  result: ProviderActionResult,
) {
  await tx.$executeRaw(Prisma.sql`INSERT INTO provider_ui_commands
    (scope,principal,"commandId","bodyHash",result) VALUES (${state.binding.scopeKey},${state.actor.id},
    ${command.commandId},${commandHash(command)},${JSON.stringify(result)}::jsonb)`);
  return result;
}
