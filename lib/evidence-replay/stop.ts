import { replayProjectScope } from "./access";
import { EvidenceReplayConflictError, type ReplayAuthority, type ReplayDatabase } from "./model";
import { readReplayRun } from "./repository";
/** Stop at a committed checkpoint. It never undoes factual projections or deletes provenance. */
export async function stopEvidenceReplay(
  db: ReplayDatabase,
  authority: ReplayAuthority,
  projectId: string,
  id: string,
  codeHash: string,
) {
  await db.query("BEGIN");
  try {
    const scope = await replayProjectScope(db, authority, projectId, true);
    const run = await readReplayRun(db, scope, id, codeHash, true);
    if (run.state === "running") {
      const changed = await db.query(
        `UPDATE history_evidence_replay_runs SET state='stopped',revision=revision+1,"updatedAt"=now() WHERE id=$1 AND "projectId"=$2 AND revision=$3 RETURNING id`,
        [id, scope.projectId, run.revision],
      );
      if (changed.rows.length !== 1) throw new EvidenceReplayConflictError();
    }
    await db.query("COMMIT");
    return { id, state: run.state === "running" ? "stopped" : run.state };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
