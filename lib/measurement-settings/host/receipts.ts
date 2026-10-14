import "server-only";
import { randomUUID } from "node:crypto";
import type { SettingsSnapshot } from "@/lib/measurement-settings/ui-contracts";
import type { SettingsHostTransaction, SettingsMutationOperation } from "./contracts";
import { SettingsHostError } from "./errors";
import { settingsActorScope, settingsHash } from "./hash";
import { settingsSnapshotSchema } from "./schema";

export function settingsMutationScope(
  projectId: string,
  actorId: string,
  operation: SettingsMutationOperation,
  command: { idempotencyKey: string },
) {
  const actorScopeHash = settingsActorScope(projectId, actorId);
  const { idempotencyKey, ...body } = command;
  return {
    projectId,
    operation,
    actorScopeHash,
    keyHash: settingsHash("mutation-key", { projectId, operation, actorScopeHash, idempotencyKey }),
    bodyHash: settingsHash("mutation-body", body),
  };
}
type Scope = ReturnType<typeof settingsMutationScope>;
/** Caller must acquire fresh authorization/writeMode/project lock before this retained diagnostic lookup. */
export async function readSettingsMutation(tx: SettingsHostTransaction, scope: Scope) {
  const row = await tx.measurementSettingsMutation.findUnique({
    where: {
      projectId_operation_keyHash: {
        projectId: scope.projectId,
        operation: scope.operation,
        keyHash: scope.keyHash,
      },
    },
  });
  if (!row) return null;
  if (row.actorScopeHash !== scope.actorScopeHash || row.bodyHash !== scope.bodyHash)
    throw new SettingsHostError("mutation_conflict");
  const parsed = settingsSnapshotSchema.safeParse(row.result);
  if (!parsed.success || parsed.data.sourceHash !== row.resultSourceHash)
    throw new SettingsHostError("source_unavailable");
  return parsed.data;
}
export async function writeSettingsMutation(
  tx: SettingsHostTransaction,
  scope: Scope,
  actorId: string,
  previousSourceHash: string,
  result: SettingsSnapshot,
) {
  const value = settingsSnapshotSchema.parse(result);
  await tx.measurementSettingsMutation.create({
    data: {
      ...scope,
      id: randomUUID(),
      actorId,
      previousSourceHash,
      resultSourceHash: value.sourceHash,
      result: value,
    },
  });
  return value;
}
