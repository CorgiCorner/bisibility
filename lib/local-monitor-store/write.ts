import "server-only";
import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { buildMonitorDefinition } from "./definition";
import { LocalMonitorConflictError } from "./model";
import { mutateMonitor } from "./mutation";
import { loadDefinitionReferences } from "./references";
import { archiveMonitorSchema, createMonitorSchema, reviseMonitorSchema } from "./schema";
import { initialManualIntent, lockedMonitor, persistDefinition, receipt } from "./storage";

type Options = { db?: LocalDatabase; clock?: () => Date };
export async function createLocalMonitor(
  command: unknown,
  context: LocalStoreContext,
  options: Options = {},
) {
  const data = createMonitorSchema.parse(command);
  return mutateMonitor({
    ...options,
    data,
    context,
    operation: "create",
    async execute(tx, scope, now) {
      const id = randomUUID(),
        revisionId = randomUUID();
      const references = await loadDefinitionReferences(tx, scope.project.id, data.definition);
      const definition = buildMonitorDefinition(data.definition, { ...references, revisionId });
      await tx.localMonitor.create({
        data: {
          id,
          publicId: makePublicId("lmn"),
          projectId: scope.project.id,
          name: definition.name,
          version: 0,
          state: "active",
          createdAt: now,
          updatedAt: now,
        },
      });
      await persistDefinition(tx, {
        id: revisionId,
        projectId: scope.project.id,
        monitorId: id,
        previousId: null,
        revision: 1,
        actorId: scope.actor.id,
        definition,
        now,
      });
      const intentId = await initialManualIntent(tx, {
        projectId: scope.project.id,
        monitorId: id,
        definitionRevisionId: revisionId,
        actorId: scope.actor.id,
        now,
      });
      return receipt(
        await tx.localMonitor.update({
          where: { id },
          data: {
            currentRevisionId: revisionId,
            currentScheduleIntentId: intentId,
            version: 1,
            updatedAt: now,
          },
        }),
      );
    },
  });
}

export async function reviseLocalMonitor(
  command: unknown,
  context: LocalStoreContext,
  options: Options = {},
) {
  const data = reviseMonitorSchema.parse(command);
  return mutateMonitor({
    ...options,
    data,
    context,
    operation: "revise",
    async execute(tx, scope, now) {
      const monitor = await lockedMonitor(
        tx,
        scope.project.id,
        data.monitorId,
        data.expectedVersion,
      );
      const previous = await tx.localMonitorRevision.findFirst({
        where: {
          projectId: scope.project.id,
          monitorId: monitor.id,
          id: monitor.currentRevisionId!,
        },
      });
      if (!previous) throw new LocalMonitorConflictError();
      const references = await loadDefinitionReferences(tx, scope.project.id, data.definition);
      const revisionId = randomUUID();
      const definition = buildMonitorDefinition(data.definition, { ...references, revisionId });
      await persistDefinition(tx, {
        id: revisionId,
        projectId: scope.project.id,
        monitorId: monitor.id,
        previousId: previous.id,
        revision: previous.revision + 1,
        actorId: scope.actor.id,
        definition,
        now,
      });
      // The old schedule consent remains history. Its old definition binding cannot launch the new revision.
      return receipt(
        await tx.localMonitor.update({
          where: { id: monitor.id },
          data: {
            name: definition.name,
            currentRevisionId: revisionId,
            version: monitor.version + 1,
            updatedAt: now,
          },
        }),
      );
    },
  });
}

export async function archiveLocalMonitor(
  command: unknown,
  context: LocalStoreContext,
  options: Options = {},
) {
  const data = archiveMonitorSchema.parse(command);
  return mutateMonitor({
    ...options,
    data,
    context,
    operation: "archive",
    async execute(tx, scope, now) {
      const row = await lockedMonitor(tx, scope.project.id, data.monitorId, data.expectedVersion);
      return receipt(
        await tx.localMonitor.update({
          where: { id: row.id },
          data: {
            state: "archived",
            version: row.version + 1,
            updatedAt: now,
          },
        }),
      );
    },
  });
}
