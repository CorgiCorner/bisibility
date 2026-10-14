import "server-only";
import { readRetainedMonitorDefinition } from "@/lib/local-monitor-results/source-definition";
import { localDigest } from "./canonical";
import type { LocalTransaction } from "./context";
import { LocalMeasurementUnavailableError } from "./errors";
/** Immutable launch identity, never the monitor's current editable revision. */
export async function readOccurrenceDefinition(
  tx: LocalTransaction,
  projectId: string,
  runId: string,
) {
  const occurrence = await tx.localMonitorOccurrence.findFirst({ where: { projectId, runId } });
  if (!occurrence) throw new LocalMeasurementUnavailableError();
  const revision = await tx.localMonitorRevision.findFirst({
    where: { projectId, monitorId: occurrence.monitorId, id: occurrence.definitionRevisionId },
  });
  if (!revision) throw new LocalMeasurementUnavailableError();
  const definition = readRetainedMonitorDefinition(revision.snapshot);
  if (
    definition.grid.revisionId !== revision.id ||
    definition.grid.revisionKey !== revision.gridRevisionKey ||
    definition.entityId !== revision.entityId ||
    definition.identityRevisionId !== revision.identityRevisionId ||
    localDigest(definition) !== revision.contentHash
  )
    throw new LocalMeasurementUnavailableError();
  return { occurrence, revision, definition };
}
