import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { prisma } from "@/lib/db/prisma";
import { assertRecoveryAdmin } from "./authorization";
import { recoveryCommandSchema } from "./command-input";
import type { RecoveryCommandResult } from "./contract";
import { RecoveryCaseChangedError } from "./errors";
import { recoveryCommitInputSchema } from "./input";
import { recoveryScope } from "./read";
import { openRecoveryCase, openRecoveryPreview, recoveryHash } from "./tokens";

export async function commitRecovery(input: unknown): Promise<RecoveryCommandResult> {
  const session = await requireInstanceAdmin(),
    value = recoveryCommitInputSchema.parse(input),
    now = new Date();
  const scope = recoveryScope(session.user.id),
    preview = openRecoveryPreview(value.previewToken, scope, now, true);
  const identityHash = recoveryHash({
    instance: scope.instance,
    items: preview.items.map((item) => {
      const identity = openRecoveryCase(item.token, scope);
      return [identity.kind, identity.id, item.version, item.action];
    }),
  });
  return prisma.$transaction(
    async (tx) => {
      await assertRecoveryAdmin(tx, scope.actor);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recovery-command:${scope.namespace}:${value.commandId}`}))`;
      const existing = await tx.meteringRecoveryCommand.findUnique({
        where: { namespace_commandId: { namespace: scope.namespace, commandId: value.commandId } },
      });
      if (existing) {
        if (existing.actorId !== scope.actor || existing.identityHash !== identityHash)
          throw new RecoveryCaseChangedError("Recovery command conflicts with another request");
        return {
          commandId: value.commandId,
          state: existing.state as RecoveryCommandResult["state"],
          outcomes: (existing.result as RecoveryCommandResult["outcomes"]) ?? [],
        };
      }
      if (Date.parse(preview.expiresAt) <= now.getTime())
        throw new RecoveryCaseChangedError("Recovery preview expired");
      await tx.meteringRecoveryCommand.create({
        data: {
          namespace: scope.namespace,
          commandId: value.commandId,
          identityHash,
          actorId: scope.actor,
          action: "repair",
          input: { instance: scope.instance, items: preview.items },
          result: [],
        },
      });
      await writeAudit(
        {
          action: "instance_admin.metering_recovery_requested",
          actorId: scope.actor,
          targetType: "instance_ops",
          targetId: "metering-recovery",
          after: { commandId: value.commandId, selected: preview.items.length, newPaidAttempts: 0 },
        },
        tx,
      );
      return { commandId: value.commandId, state: "queued", outcomes: [] };
    },
    { timeout: 30000 },
  );
}

export async function getRecoveryCommand(commandId: string): Promise<RecoveryCommandResult> {
  const session = await requireInstanceAdmin(),
    scope = recoveryScope(session.user.id);
  if (!/^[a-f0-9-]{36}$/.test(commandId)) throw new Error("Invalid recovery command");
  const command = await prisma.meteringRecoveryCommand.findUnique({
    where: { namespace_commandId: { namespace: scope.namespace, commandId } },
  });
  const input = recoveryCommandSchema.safeParse(command?.input);
  if (
    !command ||
    command.actorId !== scope.actor ||
    !input.success ||
    input.data.instance !== scope.instance
  )
    throw new Error("Recovery command unavailable");
  return {
    commandId,
    state: command.state as RecoveryCommandResult["state"],
    outcomes: (command.result as RecoveryCommandResult["outcomes"]) ?? [],
  };
}
