import { replayDigest } from "./hash";
import {
  EvidenceReplayCapacityError,
  REPLAY_LIMITS,
  type ReplayCandidate,
  type ReplayDatabase,
  type ReplaySource,
} from "./model";
import { replayCandidateSchema } from "./schema";

/** Only retained original normalized rows and their actual winning owner are selected. No rawFragment/page payload. */
const observation = `(SELECT jsonb_build_object('id',o.id,'projectId',o."projectId",'rankCheckId',o."rankCheckId",'provider',o.provider,'surface',o.surface,'engine',o.engine,'configuredScope',o."configuredScope",'effectiveScope',o."effectiveScope",'requestPolicy',o."requestPolicy",'createdAt',o."createdAt",'binding',CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id',b.id,'projectId',b."projectId",'keywordId',b."keywordId",'targetRevision',b."targetRevisionId",'policyRevision',b."policyRevisionId",'owner',b.owner,'request',b.request,'source',b.source,'capturedAt',b."capturedAt") END,'items',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'ordinal',i.ordinal,'resultKind',i."resultKind",'rankGroup',i."rankGroup",'domain',i.domain,'observedAt',i."observedAt") ORDER BY i.ordinal,i.id),'[]'::jsonb) FROM observation_items i WHERE i."observationRunId"=o.id)) FROM observation_runs o LEFT JOIN measurement_execution_bindings b ON b.id=o."definitionBindingId" AND b."projectId"=o."projectId" AND b."rankCheckId"=c.id WHERE o."rankCheckId"=c.id AND o."projectId"=k."projectId")`;
const columns = `c.id AS "checkId",c."publicId" AS "checkPublicId",c."keywordId",k."publicId" AS "keywordPublicId",c."checkedAt"::text AS "checkedAtText",c."createdAt"::text AS "createdAtText",c.status,c.provider,c."normalizationVersion",c."requestedDepth",CASE WHEN octet_length(c.raw::text)<=1048576 THEN c.raw::text ELSE NULL END AS "rawText",COALESCE(octet_length(c.raw::text),0) AS "rawBytes",c."organicRanks"::text AS "storedText",encode(sha256(convert_to(COALESCE(c.raw::text,'#SQL_NULL#'),'UTF8')),'hex') AS "rawHash",encode(sha256(convert_to(COALESCE(c."organicRanks"::text,'#SQL_NULL#'),'UTF8')),'hex') AS "storedHash",${observation} AS observation`;
function projectSource(row: Record<string, unknown>): ReplaySource {
  if (
    (row.rawText !== null && typeof row.rawText !== "string") ||
    (row.storedText !== null && typeof row.storedText !== "string")
  )
    throw new Error("evidence_replay_invalid_source");
  const observationHash = row.observation == null ? null : replayDigest(row.observation);
  const { rawText, storedText, observation: retained, ...candidate } = row;
  return {
    ...replayCandidateSchema.parse({ ...candidate, observationHash }),
    rawText: rawText as string | null,
    storedText: storedText as string | null,
    observation: retained,
  };
}
export async function discoverReplaySources(
  db: ReplayDatabase,
  projectId: string,
  window: { from: string; to: string; snapshotAt: string; maxRows: number },
) {
  const count = await db.query(
    `SELECT count(*)::int AS count,COALESCE(sum(CASE WHEN octet_length(c.raw::text)<=1048576 THEN octet_length(c.raw::text) ELSE 0 END),0)::text AS bytes FROM rank_checks c JOIN keywords k ON k.id=c."keywordId" WHERE k."projectId"=$1 AND c."checkedAt">=$2::timestamp AND c."checkedAt"<=$3::timestamp AND c."createdAt"<=$4::timestamp`,
    [projectId, window.from, window.to, window.snapshotAt],
  );
  if (
    Number(count.rows[0]?.count) > window.maxRows ||
    Number(count.rows[0]?.bytes) > REPLAY_LIMITS.batchBytes
  )
    throw new EvidenceReplayCapacityError();
  const items = await db.query(
    `SELECT count(*)::int AS count FROM observation_items i JOIN observation_runs o ON o.id=i."observationRunId" JOIN rank_checks c ON c.id=o."rankCheckId" JOIN keywords k ON k.id=c."keywordId" WHERE k."projectId"=$1 AND o."projectId"=$1 AND c."checkedAt">=$2::timestamp AND c."checkedAt"<=$3::timestamp AND c."createdAt"<=$4::timestamp`,
    [projectId, window.from, window.to, window.snapshotAt],
  );
  if (Number(items.rows[0]?.count) > 50_000) throw new EvidenceReplayCapacityError();
  const result = await db.query(
    `SELECT ${columns} FROM rank_checks c JOIN keywords k ON k.id=c."keywordId" WHERE k."projectId"=$1 AND c."checkedAt">=$2::timestamp AND c."checkedAt"<=$3::timestamp AND c."createdAt"<=$4::timestamp ORDER BY c."checkedAt",c.id LIMIT $5`,
    [projectId, window.from, window.to, window.snapshotAt, window.maxRows + 1],
  );
  if (result.rows.length > window.maxRows || result.rows.length !== Number(count.rows[0]?.count))
    throw new EvidenceReplayCapacityError();
  return result.rows.map(projectSource);
}
export async function readReplayBatch(
  db: ReplayDatabase,
  projectId: string,
  candidates: readonly ReplayCandidate[],
) {
  const rows = await db.query(
    `SELECT ${columns} FROM rank_checks c JOIN keywords k ON k.id=c."keywordId" WHERE k."projectId"=$1 AND c.id=ANY($2::text[]) ORDER BY c.id FOR UPDATE OF c`,
    [projectId, candidates.map((row) => row.checkId)],
  );
  const sources = rows.rows.map(projectSource);
  if (
    sources.reduce(
      (size, row) =>
        size +
        Buffer.byteLength(row.rawText ?? "") +
        Buffer.byteLength(JSON.stringify(row.observation)),
      0,
    ) > REPLAY_LIMITS.batchBytes
  )
    throw new EvidenceReplayCapacityError();
  return new Map(sources.map((row) => [row.checkId, row]));
}
