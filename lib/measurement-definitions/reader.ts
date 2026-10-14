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
export async function readCurrentDefinitionsInTransaction(
  tx: DefinitionTransaction,
  context: DefinitionActorContext,
  projectPublicId: string,
  keywordPublicIds: readonly string[],
  asOf: Date,
  freshness: DefinitionFreshnessPorts,
) {
  if (keywordPublicIds.length > 500 || new Set(keywordPublicIds).size !== keywordPublicIds.length)
    throw new DefinitionCapacityError();
  if (!Number.isFinite(asOf.getTime())) throw new DefinitionCapacityError();
  if (keywordPublicIds.some((id) => !isPublicIdOfType(id, "kw")))
    throw new DefinitionUnavailableError();
  const actor = context.actor ? { id: context.actor.id } : null;
  const ids = [...keywordPublicIds];
  const project = await definitionProjectScope(tx, { actor }, projectPublicId, "read");
  return readProjectDefinitionMetadata(tx, project, ids, new Date(asOf.getTime()), freshness);
}
async function readProjectDefinitionMetadata(
  tx: DefinitionTransaction,
  project: { id: string; publicId: string },
  keywordPublicIds: readonly string[],
  asOf: Date,
  freshness: DefinitionFreshnessPorts,
) {
  const keywords = await tx.keyword.findMany({
    where: { projectId: project.id, publicId: { in: [...keywordPublicIds] } },
    select: { id: true, publicId: true },
  });
  // Missing and foreign public IDs receive no existence disclosure.
  const result = new Map<string, CurrentDefinitionMetadata>();
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
  return result;
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
    { isolationLevel: "RepeatableRead" },
  );
}

/** Project-key/service transport must renew its real credential authority, not synthesize a User actor. */
export async function readCurrentDefinitionsForVerifiedScope(
  tx: DefinitionTransaction,
  input: Readonly<{
    project: { id: string; publicId: string };
    keywordPublicIds: readonly string[];
    asOf: Date;
  }>,
  host: Readonly<{
    assertFreshScope: (
      tx: DefinitionTransaction,
      project: { id: string; publicId: string },
      keywordPublicIds: readonly string[],
    ) => Promise<void>;
    freshness: DefinitionFreshnessPorts;
  }>,
) {
  if (
    input.keywordPublicIds.length > 500 ||
    new Set(input.keywordPublicIds).size !== input.keywordPublicIds.length ||
    !Number.isFinite(input.asOf.getTime())
  )
    throw new DefinitionCapacityError();
  if (input.keywordPublicIds.some((id) => !isPublicIdOfType(id, "kw")))
    throw new DefinitionUnavailableError();
  const project = Object.freeze({ ...input.project });
  const ids = Object.freeze([...input.keywordPublicIds]);
  const asOf = new Date(input.asOf.getTime());
  await host.assertFreshScope(tx, project, ids);
  return readProjectDefinitionMetadata(tx, project, ids, asOf, host.freshness);
}
