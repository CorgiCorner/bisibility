import "server-only";
import type { RankTrackerDefinitionLoader } from "@/lib/queries/rank-tracker-report-model";
import type {
  CurrentDefinitionMetadata,
  DefinitionActorContext,
  DefinitionFreshnessPorts,
  DefinitionTransaction,
} from "./model";
import {
  readDefinitionsAtDatesForVerifiedScope,
  readDefinitionsAtDatesInTransaction,
} from "./reader";

/** Session/personal-user transport. Compose volume/traffic metadata separately without replacing explicit nulls. */
export function currentDefinitionMetadataLoader(
  context: DefinitionActorContext,
  freshness: DefinitionFreshnessPorts,
): RankTrackerDefinitionLoader {
  const atDates: NonNullable<RankTrackerDefinitionLoader["atDates"]> = async (
    tx,
    project,
    targets,
    dates,
  ) => {
    const definitions = await readDefinitionsAtDatesInTransaction(
      tx,
      context,
      project.publicId,
      targets.map((target) => target.publicId),
      dates,
      freshness,
    );
    return definitions.map(withVolume);
  };
  return Object.assign<RankTrackerDefinitionLoader, object>(
    async (tx, project, targets, asOf) => (await atDates(tx, project, targets, [asOf]))[0],
    { atDates },
  );
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
): RankTrackerDefinitionLoader {
  const atDates: NonNullable<RankTrackerDefinitionLoader["atDates"]> = async (
    tx,
    project,
    targets,
    dates,
  ) => {
    const definitions = await readDefinitionsAtDatesForVerifiedScope(
      tx,
      { project, keywordPublicIds: targets.map((target) => target.publicId), dates },
      host,
    );
    return definitions.map(withVolume);
  };
  return Object.assign<RankTrackerDefinitionLoader, object>(
    async (tx, project, targets, asOf) => (await atDates(tx, project, targets, [asOf]))[0],
    { atDates },
  );
}
function withVolume(definitions: ReadonlyMap<string, CurrentDefinitionMetadata>) {
  return new Map(
    [...definitions].map(([id, metadata]) => [id, { ...metadata, volume: null }] as const),
  );
}
