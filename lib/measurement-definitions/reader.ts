import { REPORT_READ_TRANSACTION } from "@/lib/rank-reports/read-transaction";
import "server-only";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { definitionProjectScope } from "./access";
import { currentHeadMatches, frozenConfiguredScope } from "./canonical";
import { DefinitionCapacityError, DefinitionUnavailableError } from "./errors";
import { definitionFreshness } from "./freshness";
import type {
  CurrentDefinitionMetadata,
  DefinitionActorContext,
  DefinitionDatabase,
  DefinitionFreshnessPorts,
  DefinitionTransaction,
} from "./model";
import { definitionAuthorityInstalled, readDefinitionMetadataRows } from "./storage";

const unavailable: CurrentDefinitionMetadata = {
  expectedScope: null,
  freshForMs: null,
  freshnessReason: "policy_unavailable",
};
function snapshotReadInput(ids: readonly string[], dates: readonly Date[]) {
  if (
    ids.length > 500 ||
    new Set(ids).size !== ids.length ||
    dates.length < 1 ||
    dates.length > 2 ||
    dates.some((at) => !Number.isFinite(at.getTime()))
  )
    throw new DefinitionCapacityError();
  if (ids.some((id) => !isPublicIdOfType(id, "kw"))) throw new DefinitionUnavailableError();
  return { ids: Object.freeze([...ids]), dates: dates.map((at) => new Date(at.getTime())) };
}

/** One invocation captures one authorized source snapshot; dates only change its evaluation. */
export async function readDefinitionsAtDatesInTransaction(
  tx: DefinitionTransaction,
  context: DefinitionActorContext,
  projectPublicId: string,
  keywordPublicIds: readonly string[],
  dates: readonly Date[],
  freshness: DefinitionFreshnessPorts,
) {
  const input = snapshotReadInput(keywordPublicIds, dates);
  const actor = context.actor ? { id: context.actor.id } : null;
  const project = await definitionProjectScope(tx, { actor }, projectPublicId, "read");
  return readProjectDefinitionMetadata(tx, project, input.ids, input.dates, freshness);
}
export async function readCurrentDefinitionsInTransaction(
  tx: DefinitionTransaction,
  context: DefinitionActorContext,
  projectPublicId: string,
  keywordPublicIds: readonly string[],
  asOf: Date,
  freshness: DefinitionFreshnessPorts,
) {
  const [current] = await readDefinitionsAtDatesInTransaction(
    tx,
    context,
    projectPublicId,
    keywordPublicIds,
    [asOf],
    freshness,
  );
  return current;
}
async function readProjectDefinitionMetadata(
  tx: DefinitionTransaction,
  project: { id: string; publicId: string },
  keywordPublicIds: readonly string[],
  dates: readonly Date[],
  freshness: DefinitionFreshnessPorts,
) {
  const keywords = await tx.keyword.findMany({
    where: { projectId: project.id, publicId: { in: [...keywordPublicIds] } },
    select: { id: true, publicId: true },
  });
  // Missing and foreign public IDs receive no existence disclosure.
  const installed = await definitionAuthorityInstalled(tx);
  const captured = new Map(
    (installed
      ? await readDefinitionMetadataRows(
          tx,
          project.id,
          keywords.map((keyword) => keyword.id),
        )
      : []
    ).map((row) => [row.keywordId, row] as const),
  );
  const results: Map<string, CurrentDefinitionMetadata>[] = [];
  for (const asOf of dates) {
    const result = new Map<string, CurrentDefinitionMetadata>();
    for (const keyword of keywords) {
      if (!installed) {
        result.set(keyword.publicId, unavailable);
        continue;
      }
      const { head, source } = captured.get(keyword.id) ?? { head: null, source: null };
      if (!head || !source || head.capturedAt > asOf) {
        result.set(keyword.publicId, unavailable);
        continue;
      }
      if (
        !source.policy.config ||
        source.target.archivedAt ||
        !trackedProjectDomain(source.target.domain) ||
        !currentHeadMatches(head, source)
      ) {
        result.set(keyword.publicId, unavailable);
        continue;
      }
      // Construct from the immutable captured target, never mutable keyword data or observation history.
      result.set(keyword.publicId, {
        expectedScope: {
          projectId: project.id,
          targetId: keyword.publicId,
          targetRevision: head.targetRevision,
          policyRevision: head.policyRevision,
          engine: "google",
          surface: "web_serp",
          resultKind: "organic_result",
          rankScale: "organic_group",
          ...frozenConfiguredScope(head.targetSource),
        },
        ...(await definitionFreshness(tx, source, asOf, freshness)),
      });
    }
    results.push(result);
  }
  return results;
}
/** RepeatableRead makes authority and semantic-source proof one snapshot without FOR SHARE on reads. */
export function readCurrentDefinitions(
  db: DefinitionDatabase,
  context: DefinitionActorContext,
  projectPublicId: string,
  keywordPublicIds: readonly string[],
  asOf: Date,
  freshness: DefinitionFreshnessPorts,
) {
  return db.$transaction(
    (tx) =>
      readCurrentDefinitionsInTransaction(
        tx,
        context,
        projectPublicId,
        keywordPublicIds,
        asOf,
        freshness,
      ),
    REPORT_READ_TRANSACTION,
  );
}

type VerifiedDefinitionHost = Readonly<{
  assertFreshScope: (
    tx: DefinitionTransaction,
    project: { id: string; publicId: string },
    keywordPublicIds: readonly string[],
  ) => Promise<void>;
  freshness: DefinitionFreshnessPorts;
}>;

/** Project-key/service transport renews its real credential once per paired snapshot read. */
export async function readDefinitionsAtDatesForVerifiedScope(
  tx: DefinitionTransaction,
  input: Readonly<{
    project: { id: string; publicId: string };
    keywordPublicIds: readonly string[];
    dates: readonly Date[];
  }>,
  host: VerifiedDefinitionHost,
) {
  const snapshot = snapshotReadInput(input.keywordPublicIds, input.dates);
  const project = Object.freeze({ ...input.project });
  await host.assertFreshScope(tx, project, snapshot.ids);
  return readProjectDefinitionMetadata(tx, project, snapshot.ids, snapshot.dates, host.freshness);
}
export async function readCurrentDefinitionsForVerifiedScope(
  tx: DefinitionTransaction,
  input: Readonly<{
    project: { id: string; publicId: string };
    keywordPublicIds: readonly string[];
    asOf: Date;
  }>,
  host: VerifiedDefinitionHost,
) {
  const [current] = await readDefinitionsAtDatesForVerifiedScope(
    tx,
    { ...input, dates: [input.asOf] },
    host,
  );
  return current;
}
