import { replayProjectScope } from "./access";
import { evaluateOrganicReplay } from "./evaluate";
import { replayDigest } from "./hash";
import {
  EvidenceReplayCapacityError,
  EvidenceReplayConflictError,
  REPLAY_LIMITS,
  type ReplayAuthority,
  type ReplayCandidate,
  type ReplayDatabase,
  type ReplayEvaluation,
  type ReplayRun,
} from "./model";
import { applyReplayEntries, createReplayRun, type ReplayEntry, readReplayRun } from "./repository";
import { replayRequestSchema } from "./schema";
import { discoverReplaySources, readReplayBatch } from "./source-query";

function candidate(
  source: ReplayCandidate & {
    rawText?: string | null;
    storedText?: string | null;
    observation?: unknown;
  },
): ReplayCandidate {
  const { rawText: _raw, storedText: _stored, observation: _observation, ...manifest } = source;
  return manifest;
}
export async function prepareEvidenceReplay(
  db: ReplayDatabase,
  authority: ReplayAuthority,
  input: unknown,
  codeHash: string,
  dryRun = true,
  clock: () => Date = () => new Date(),
) {
  const request = replayRequestSchema.parse(input),
    snapshotAt = clock().toISOString();
  if (Date.parse(request.to) > Date.parse(snapshotAt) || !/^[a-f0-9]{64}$/u.test(codeHash))
    throw new EvidenceReplayConflictError();
  await db.query(`BEGIN ISOLATION LEVEL REPEATABLE READ${dryRun ? " READ ONLY" : ""}`);
  try {
    const principal = await replayProjectScope(db, authority, request.projectId, !dryRun);
    const sources = await discoverReplaySources(db, principal.projectId, {
      ...request,
      snapshotAt,
    });
    const manifest = sources.map(candidate);
    if (Buffer.byteLength(JSON.stringify(manifest)) > REPLAY_LIMITS.manifestBytes)
      throw new EvidenceReplayCapacityError();
    const expected = {
      scanned: sources.length,
      changed: 0,
      projectionPresent: 0,
      excluded: {} as Record<string, number>,
    };
    for (const source of sources) {
      const evaluation = evaluateOrganicReplay(source, principal.projectId);
      if (evaluation.status === "applied") expected.changed++;
      else if (evaluation.status === "projection_present") expected.projectionPresent++;
      else expected.excluded[evaluation.status] = (expected.excluded[evaluation.status] ?? 0) + 1;
    }
    const run = dryRun
      ? null
      : await createReplayRun(db, principal, request, codeHash, manifest, snapshotAt);
    await db.query("COMMIT");
    return { dryRun, expected, manifestHash: replayDigest(manifest), run };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
/** Each invocation is one short atomic batch. The operator may stop between batches. */
export async function applyEvidenceReplayBatch(
  db: ReplayDatabase,
  authority: ReplayAuthority,
  projectPublicId: string,
  runId: string,
  codeHash: string,
  batchSize: number = REPLAY_LIMITS.batchSize,
): Promise<ReplayRun> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > REPLAY_LIMITS.batchSize)
    throw new EvidenceReplayCapacityError();
  await db.query("BEGIN");
  try {
    const principal = await replayProjectScope(db, authority, projectPublicId, true);
    const run = await readReplayRun(db, principal, runId, codeHash, true);
    if (run.state !== "running") {
      await db.query("COMMIT");
      return run;
    }
    const selected = run.manifest.slice(run.cursor, run.cursor + batchSize);
    const sources = await readReplayBatch(db, run.projectId, selected);
    const entries: ReplayEntry[] = selected.map((original) => {
      const source = sources.get(original.checkId);
      if (!source)
        return {
          candidate: original,
          present: false,
          evaluation: {
            status: "source_missing",
            facts: null,
            outputHash: null,
            retainedObservedAt: null,
            sourceKind: "unavailable",
            qualification: "retained_facts_only",
          } satisfies ReplayEvaluation,
        };
      if (replayDigest(candidate(source)) !== replayDigest(original))
        throw new EvidenceReplayConflictError();
      return {
        candidate: original,
        present: true,
        evaluation: evaluateOrganicReplay(source, run.projectId),
      };
    });
    const updated = await applyReplayEntries(db, run, entries);
    await db.query("COMMIT");
    return updated;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
