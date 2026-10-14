import "server-only";
import { definitionProjectScope } from "./access";
import { sameDefinitionBytes } from "./canonical";
import { DefinitionConflictError, DefinitionUnavailableError } from "./errors";
import type { DefinitionActorContext, DefinitionAuditPort, DefinitionDatabase } from "./model";
import { configurePolicySchema } from "./schema";
import { definitionAuthorityInstalled } from "./storage";

/** Explicit host configuration, not read-time initialization. Semantic CAS participates in the epoch trigger. */
export function configureDefinitionPolicy(
  db: DefinitionDatabase,
  context: DefinitionActorContext,
  input: unknown,
  recordMutation: DefinitionAuditPort,
) {
  const data = configurePolicySchema.parse(input);
  const actor = context.actor ? { id: context.actor.id } : null;
  return db.$transaction(async (tx) => {
    const project = await definitionProjectScope(
      tx,
      { actor },
      data.projectId,
      "update",
      "project_defaults",
    );
    if (!(await definitionAuthorityInstalled(tx))) throw new DefinitionUnavailableError();
    const rows = await tx.$queryRaw<
      Array<{ epoch: string; config: unknown }>
    >`SELECT "measurementPolicyEpoch"::text AS epoch,"measurementPolicyConfig" AS config FROM projects WHERE id=${project.id}`;
    const retained = rows[0];
    if (!retained || retained.epoch !== data.expectedPolicyEpoch)
      throw new DefinitionConflictError();
    if (sameDefinitionBytes(retained.config, data.config))
      return { policyEpoch: retained.epoch, changed: false };
    const changed = await tx.$queryRaw<
      Array<{ epoch: string }>
    >`UPDATE projects SET "measurementPolicyConfig"=${JSON.stringify(data.config)}::jsonb WHERE id=${project.id} AND "measurementPolicyEpoch"=${data.expectedPolicyEpoch}::bigint RETURNING "measurementPolicyEpoch"::text AS epoch`;
    if (changed.length !== 1) throw new DefinitionConflictError();
    await recordMutation(tx, {
      actorId: actor!.id,
      projectId: project.id,
      keywordId: null,
      operation: "configure",
      revisionId: changed[0].epoch,
      previousRevisionId: retained.epoch,
    });
    return { policyEpoch: changed[0].epoch, changed: true };
  });
}
