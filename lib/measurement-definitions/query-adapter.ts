import "server-only";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import type {
  DefinitionActorContext,
  DefinitionFreshnessPorts,
  DefinitionTransaction,
} from "./model";
import {
  readCurrentDefinitionsForVerifiedScope,
  readCurrentDefinitionsInTransaction,
} from "./reader";

/** Session/personal-user transport. Compose volume/traffic metadata separately without replacing explicit nulls. */
export function currentDefinitionMetadataLoader(
  context: DefinitionActorContext,
  freshness: DefinitionFreshnessPorts,
): RankTrackerReportOptions["loadMetadata"] {
  return async (tx, project, targets, asOf) => {
    const definitions = await readCurrentDefinitionsInTransaction(
      tx,
      context,
      project.publicId,
      targets.map((target) => target.publicId),
      asOf,
      freshness,
    );
    return new Map(
      [...definitions].map(([id, metadata]) => [id, { ...metadata, volume: null }] as const),
    );
  };
}
/** Project keys have no User membership; the host must renew the verified credential scope on every read. */
export function verifiedDefinitionMetadataLoader(
  host: Readonly<{
    assertFreshScope: (
      tx: DefinitionTransaction,
      project: { id: string; publicId: string },
      keywordPublicIds: readonly string[],
    ) => Promise<void>;
    freshness: DefinitionFreshnessPorts;
  }>,
): RankTrackerReportOptions["loadMetadata"] {
  return async (tx, project, targets, asOf) => {
    const definitions = await readCurrentDefinitionsForVerifiedScope(
      tx,
      { project, keywordPublicIds: targets.map((target) => target.publicId), asOf },
      host,
    );
    return new Map(
      [...definitions].map(([id, metadata]) => [id, { ...metadata, volume: null }] as const),
    );
  };
}
