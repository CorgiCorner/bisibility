import "server-only";
import { type Actor, AuthorizationError } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { retryTransientDatabaseRead } from "@/lib/db/transient-read";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type {
  ProviderActionResult,
  ProviderBinding,
  ProviderReadResult,
  ProviderReconciliation,
} from "@usagekit/views";
import { retainCommand, retainedCommand } from "./journal";
import { mutateProviderUi } from "./mutate";
import { loadNativeAllocationRows } from "./native-allocation-read";
import { readProviderUi } from "./read";
import { providerUiCommandSchema, providerUiQuerySchema } from "./schema";
import { connectionRevision, loadProviderUiState } from "./state";
import { loadProviderUiRates } from "./state-rates";

type Scope = { actor: Actor; projectPublicId: string };
const readTransaction = {
  isolationLevel: "RepeatableRead" as const,
  maxWait: 5_000,
  timeout: 15_000,
};
const unavailable = (commandId: string): ProviderActionResult => ({
  commandId,
  outcome: "unavailable",
  ambiguous: true,
  message: "Command status is unavailable. Reconcile the original command.",
});
const commandId = (raw: unknown) =>
  raw &&
  typeof raw === "object" &&
  "commandId" in raw &&
  typeof raw.commandId === "string" &&
  /^[A-Za-z0-9_-]{8,128}$/.test(raw.commandId)
    ? raw.commandId
    : "invalid-command";

export function createProviderUiService(database: Pick<PrismaClient, "$transaction"> = prisma) {
  return {
    async binding(scope: Scope): Promise<ProviderBinding | null> {
      try {
        const result = await retryTransientDatabaseRead(() =>
          database.$transaction(
            async (tx) =>
              (await loadProviderUiState(tx, scope.actor, scope.projectPublicId, "binding"))
                .binding,
            readTransaction,
          ),
        );
        if (!result.ok) throw new Error("Provider binding read unavailable.");
        return result.value;
      } catch (error) {
        if (error instanceof AuthorizationError) return null;
        throw new Error("Provider settings could not be confirmed.");
      }
    },
    async read(scope: Scope, raw: unknown): Promise<ProviderReadResult> {
      const parsed = providerUiQuerySchema.safeParse(raw);
      if (!parsed.success) return { outcome: "invalid", field: "query", reason: "invalid_query" };
      try {
        const state = await database.$transaction(async (tx) => {
          const state = await loadProviderUiState(tx, scope.actor, scope.projectPublicId, "read", {
            financialEvidence: parsed.data.kind === "allocations",
          });
          await loadProviderUiRates(tx, state, parsed.data);
          return state;
        }, readTransaction);
        if (parsed.data.kind === "allocations")
          await loadNativeAllocationRows(state, parsed.data.connectionIds);
        return readProviderUi(state, parsed.data);
      } catch (error) {
        return error instanceof AuthorizationError
          ? { outcome: "forbidden" }
          : { outcome: "unavailable", message: "Stored provider data is unavailable." };
      }
    },
    async execute(scope: Scope, raw: unknown): Promise<ProviderActionResult> {
      const parsed = providerUiCommandSchema.safeParse(raw);
      if (!parsed.success)
        return {
          commandId: commandId(raw),
          outcome: "invalid",
          field: "command",
          reason: "unsupported_or_invalid_command",
        };
      const command = parsed.data;
      try {
        return await database.$transaction(async (tx) => {
          const state = await loadProviderUiState(tx, scope.actor, scope.projectPublicId);
          if (!state.binding.canManage)
            return { commandId: command.commandId, outcome: "forbidden" } as const;
          const replay = await retainedCommand(tx, state, command);
          if (replay) return replay;
          const refusal = await mutateProviderUi(tx, state, command);
          const latest = refusal
            ? state
            : await loadProviderUiState(tx, scope.actor, scope.projectPublicId);
          const connection =
            command.kind === "rates"
              ? latest.connections.find((row) => row.publicId === command.connectionId)
              : null;
          const result: ProviderActionResult = refusal ?? {
            commandId: command.commandId,
            outcome: "success",
            revision: connection ? connectionRevision(latest, connection) : latest.revision,
          };
          return retainCommand(tx, state, command, result);
        });
      } catch (error) {
        return error instanceof AuthorizationError
          ? { commandId: command.commandId, outcome: "forbidden" }
          : unavailable(command.commandId);
      }
    },
    async reconcile(scope: Scope, raw: unknown): Promise<ProviderReconciliation> {
      const parsed = providerUiCommandSchema.safeParse(raw);
      if (!parsed.success)
        return {
          commandId: commandId(raw),
          outcome: "invalid",
          field: "command",
          reason: "unsupported_or_invalid_command",
        };
      try {
        return await database.$transaction(async (tx) => {
          const state = await loadProviderUiState(tx, scope.actor, scope.projectPublicId);
          return (
            (await retainedCommand(tx, state, parsed.data)) ?? unavailable(parsed.data.commandId)
          );
        });
      } catch (error) {
        return error instanceof AuthorizationError
          ? { commandId: parsed.data.commandId, outcome: "forbidden" }
          : unavailable(parsed.data.commandId);
      }
    },
  };
}

export const providerUiService = createProviderUiService();
