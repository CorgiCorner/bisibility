import { randomUUID } from "node:crypto";
import { replayDigest } from "./hash";
import {
  EvidenceReplayConflictError,
  ORGANIC_EVIDENCE_REPLAY_VERSION,
  type ReplayCandidate,
  type ReplayCounts,
  type ReplayDatabase,
  type ReplayEvaluation,
  type ReplayPrincipal,
  type ReplayRequest,
  type ReplayRun,
} from "./model";
import { replayCandidateSchema, replayRequestSchema } from "./schema";

export async function createReplayRun(
  db: ReplayDatabase,
  principal: ReplayPrincipal,
  request: ReplayRequest,
  codeHash: string,
  manifest: ReplayCandidate[],
  snapshotAt: string,
): Promise<ReplayRun> {
  const id = randomUUID(),
    manifestHash = replayDigest(manifest);
  const requestHash = replayDigest([
    principal,
    { ...request, batchSize: undefined },
    ORGANIC_EVIDENCE_REPLAY_VERSION,
    codeHash,
  ]);
  await db.query(
    `INSERT INTO history_evidence_replay_runs(id,"projectId","initiatorKind","initiatorRef","parserVersion","codeHash","requestHash",request,manifest,"manifestHash","snapshotAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::timestamptz)`,
    [
      id,
      principal.projectId,
      principal.kind,
      principal.reference,
      ORGANIC_EVIDENCE_REPLAY_VERSION,
      codeHash,
      requestHash,
      JSON.stringify(request),
      JSON.stringify(manifest),
      manifestHash,
      snapshotAt,
    ],
  );
  return {
    id,
    projectId: principal.projectId,
    projectPublicId: principal.projectPublicId,
    principal,
    request,
    parserVersion: ORGANIC_EVIDENCE_REPLAY_VERSION,
    codeHash,
    manifestHash,
    manifest,
    snapshotAt,
    cursor: 0,
    revision: 0,
    counts: { scanned: 0, applied: 0, excluded: 0, projectionPresent: 0 },
    state: "running",
  };
}
export async function readReplayRun(
  db: ReplayDatabase,
  principal: ReplayPrincipal,
  id: string,
  codeHash: string,
  lock = false,
): Promise<ReplayRun> {
  const result = await db.query(
    `SELECT * FROM history_evidence_replay_runs WHERE id=$1 AND "projectId"=$2${lock ? " FOR UPDATE" : ""}`,
    [id, principal.projectId],
  );
  const row = result.rows[0];
  if (
    !row ||
    row.initiatorKind !== principal.kind ||
    row.initiatorRef !== principal.reference ||
    row.parserVersion !== ORGANIC_EVIDENCE_REPLAY_VERSION ||
    row.codeHash !== codeHash ||
    !["running", "completed", "stopped"].includes(String(row.state))
  )
    throw new EvidenceReplayConflictError();
  const manifest = replayCandidateSchema.array().parse(row.manifest),
    request = replayRequestSchema.parse(row.request);
  if (
    request.projectId !== principal.projectPublicId ||
    replayDigest(manifest) !== row.manifestHash ||
    row.requestHash !==
      replayDigest([
        principal,
        { ...request, batchSize: undefined },
        ORGANIC_EVIDENCE_REPLAY_VERSION,
        codeHash,
      ])
  )
    throw new EvidenceReplayConflictError();
  const cursor = Number(row.cursor),
    revision = Number(row.revision);
  const counts = {
    scanned: cursor,
    applied: Number(row.applied),
    excluded: Number(row.excluded),
    projectionPresent: Number(row.projectionPresent),
  };
  if (
    manifest.length > request.maxRows ||
    Object.values(counts).some((value) => !Number.isSafeInteger(value) || value < 0) ||
    counts.applied + counts.excluded + counts.projectionPresent !== cursor
  )
    throw new EvidenceReplayConflictError();
  if (
    !Number.isSafeInteger(cursor) ||
    cursor < 0 ||
    cursor > manifest.length ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  )
    throw new EvidenceReplayConflictError();
  return {
    id,
    projectId: principal.projectId,
    projectPublicId: principal.projectPublicId,
    principal,
    request,
    parserVersion: ORGANIC_EVIDENCE_REPLAY_VERSION,
    codeHash,
    manifestHash: replayDigest(manifest),
    manifest,
    snapshotAt: new Date(String(row.snapshotAt)).toISOString(),
    cursor,
    revision,
    counts,
    state: row.state as ReplayRun["state"],
  };
}
export type ReplayEntry = {
  candidate: ReplayCandidate;
  evaluation: ReplayEvaluation;
  present: boolean;
};
export async function applyReplayEntries(
  db: ReplayDatabase,
  run: ReplayRun,
  entries: ReplayEntry[],
) {
  const apply = entries
    .filter((row) => row.evaluation.status === "applied")
    .map(({ candidate, evaluation }) => ({ ...candidate, facts: evaluation.facts }));
  if (apply.length) {
    const written = await db.query(
      `UPDATE rank_checks c SET "organicRanks"=s.facts FROM jsonb_to_recordset($1::jsonb) AS s("checkId" text,"keywordId" text,"rawHash" text,"checkedAtText" text,"createdAtText" text,facts jsonb) WHERE c.id=s."checkId" AND c."keywordId"=s."keywordId" AND c."organicRanks" IS NULL AND c."checkedAt"::text=s."checkedAtText" AND c."createdAt"::text=s."createdAtText" AND encode(sha256(convert_to(COALESCE(c.raw::text,'#SQL_NULL#'),'UTF8')),'hex')=s."rawHash" RETURNING c.id`,
      [JSON.stringify(apply)],
    );
    if (written.rows.length !== apply.length) throw new EvidenceReplayConflictError();
  }
  const receipts = entries.map(({ candidate, evaluation, present }) => ({
    id: randomUUID(),
    sourceId: candidate.checkId,
    keywordId: present ? candidate.keywordId : null,
    rankCheckId: present ? candidate.checkId : null,
    sourceHash: candidate.rawHash,
    originalCheckedAt: candidate.checkedAtText,
    retainedObservedAt: evaluation.retainedObservedAt,
    sourceKind: evaluation.sourceKind,
    status: evaluation.status,
    outputHash: evaluation.outputHash,
    normalizedFacts: evaluation.facts,
  }));
  if (receipts.length)
    await db.query(
      `INSERT INTO history_evidence_replay_receipts(id,"projectId","runId","sourceId","keywordId","rankCheckId","sourceHash","parserVersion","codeHash","originalCheckedAt","retainedObservedAt","sourceKind",status,"outputHash","normalizedFacts") SELECT s.id,$2,$3,s."sourceId",s."keywordId",s."rankCheckId",s."sourceHash",$4,$5,s."originalCheckedAt"::timestamp,s."retainedObservedAt"::timestamptz,s."sourceKind",s.status,s."outputHash",s."normalizedFacts" FROM jsonb_to_recordset($1::jsonb) AS s(id text,"sourceId" text,"keywordId" text,"rankCheckId" text,"sourceHash" text,"originalCheckedAt" text,"retainedObservedAt" text,"sourceKind" text,status text,"outputHash" text,"normalizedFacts" jsonb)`,
      [JSON.stringify(receipts), run.projectId, run.id, run.parserVersion, run.codeHash],
    );
  const counts: ReplayCounts = { ...run.counts, scanned: run.cursor + entries.length };
  for (const { evaluation } of entries) {
    if (evaluation.status === "applied") counts.applied++;
    else if (evaluation.status === "projection_present") counts.projectionPresent++;
    else counts.excluded++;
  }
  const state = counts.scanned === run.manifest.length ? "completed" : "running";
  const changed = await db.query(
    `UPDATE history_evidence_replay_runs SET cursor=$1,revision=revision+1,applied=$2,excluded=$3,"projectionPresent"=$4,state=$5,"updatedAt"=now() WHERE id=$6 AND "projectId"=$7 AND cursor=$8 AND revision=$9 AND state='running' RETURNING id`,
    [
      counts.scanned,
      counts.applied,
      counts.excluded,
      counts.projectionPresent,
      state,
      run.id,
      run.projectId,
      run.cursor,
      run.revision,
    ],
  );
  if (changed.rows.length !== 1) throw new EvidenceReplayConflictError();
  return { ...run, counts, cursor: counts.scanned, revision: run.revision + 1, state } as ReplayRun;
}
